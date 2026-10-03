/**
 * 服务端的配置：`config.json` 的读写与默认值。
 *
 * 这个目录（`src/server/`）**不 import 仓库里任何其它模块** —— 它不是浏览器包的一部分，
 * 而是用 `node src/server/main.ts` 直接跑的一个独立进程。原因是仓库现有的相对 import 都不带
 * 扩展名（`from '../utils/tags'`），那是 Vite / bundler 的解析规则；Node 的 ESM 解析器不认，
 * 一旦跨目录 import 就会 ERR_MODULE_NOT_FOUND。所以这里只依赖 `node:*` 内建。
 *
 * 代价是「备份模块名」这份清单在两边各有一份。**防漂移靠测试**，不靠约定：
 * `src/server/schemas-parity.test.ts` 会断言这份清单与 `src/services/schemas.ts` 的
 * `BACKUP_MODULES` 逐字相等（那个测试跑在 vitest 里，可以正常 import 仓库模块）。
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 备份模块名（23 条），与 `src/services/schemas.ts` 的 `BACKUP_MODULES` 必须逐字相等。
 *
 * 副本的 `data` 段与这份清单**严格一一对应**：一个不多、一个不少，没有例外行。
 * `settings`（主题 / 皮肤 / 密度 / 侧栏折叠）**故意不在其中** —— 它是每台设备各自的 UI 状态，
 * 共享副本装谁的都是随机的（定案见 spec「定案：`settings` 键不进副本」）。
 */
export const SYNC_MODULES = [
  'tasks',
  'memos',
  'books',
  'devProjects',
  'workSessions',
  'writingProjects',
  'fitnessPlans',
  'fitnessRecords',
  'bodyMetrics',
  'dietRecords',
  'mealTemplates',
  'dietGoals',
  'dietWater',
  'games',
  'gameSessions',
  'readingSessions',
  'habits',
  'focusSessions',
  'reviews',
  'journal',
  'goals',
  'customFoods',
  'customExercises',
] as const;

export type SyncModule = (typeof SYNC_MODULES)[number];

/** 服务端支持的备份 / 副本结构版本；客户端声明更高时拒绝写入（要求先升级服务端）。 */
export const SERVER_SCHEMA_VERSION = 20;

export interface ServerConfig {
  port: number;
  host: string;
  token: string;
  dataDir: string;
  mirrorDir: string;
  allowedOrigins: string[];
}

/** 默认监听地址：只绑本机回环，不监听 0.0.0.0。 */
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 8787;

/** CORS 默认放行的 origin 模式；应用可能跑在 5173、4173 或别的端口。 */
export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:*', 'http://127.0.0.1:*'];

/** `config.json` 放哪：优先 `LM_SYNC_CONFIG`，否则 `src/server/config.json`。 */
export function defaultConfigPath(): string {
  const fromEnv = process.env.LM_SYNC_CONFIG;
  if (fromEnv && fromEnv.trim() !== '') return resolve(fromEnv);
  return join(dirname(fileURLToPath(import.meta.url)), 'config.json');
}

/** 令牌：32 字节随机数的十六进制串（64 个字符）。 */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function toPositiveInt(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function toStringArray(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const items = raw.filter(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  );
  return items.length > 0 ? items : fallback;
}

/**
 * 从磁盘读配置；**没有文件时生成一份**（含新令牌）并写回。
 *
 * 返回值里的 `created` 供启动日志判断要不要把令牌打印一次 —— 令牌只在「刚生成」时打印，
 * 之后每次启动都打会把密钥刷进日志文件。
 */
export function loadOrCreateConfig(configPath = defaultConfigPath()): {
  config: ServerConfig;
  created: boolean;
} {
  const baseDir = dirname(configPath);

  if (existsSync(configPath)) {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<ServerConfig>;
    return {
      config: {
        port: toPositiveInt(raw.port, DEFAULT_PORT),
        host: typeof raw.host === 'string' && raw.host.trim() !== '' ? raw.host : DEFAULT_HOST,
        // 文件里没有令牌就补一个，但不重写文件（避免把一个手改过的配置覆盖掉）
        token:
          typeof raw.token === 'string' && raw.token.trim() !== '' ? raw.token : generateToken(),
        dataDir:
          typeof raw.dataDir === 'string' && raw.dataDir.trim() !== ''
            ? raw.dataDir
            : join(baseDir, 'data'),
        mirrorDir: typeof raw.mirrorDir === 'string' ? raw.mirrorDir : '',
        allowedOrigins: toStringArray(raw.allowedOrigins, DEFAULT_ALLOWED_ORIGINS),
      },
      created: false,
    };
  }

  const config: ServerConfig = {
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    token: generateToken(),
    dataDir: join(baseDir, 'data'),
    // 留空：第二份存储要用户自己指定一个**离开本机**的目录（ADR-0002 的代价）。
    // 不默认指向 dataDir 的兄弟目录 —— 那等于第二份与第一份同生共死，白付代价。
    mirrorDir: '',
    allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
  };

  mkdirSync(baseDir, { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { config, created: true };
}

/**
 * 服务启动时会用到的目录，按需创建。
 *
 * - `dataDir` 建不出来是**致命的**：没有它服务没有落脚点，让它抛出去。
 * - `mirrorDir` 建不出来**只记一条警告**，绝不抛。这是 ADR-0002 里那条代价的正常失败形态：
 *   同步盘没挂载 / 盘符变了 / 开机时还没就绪 —— 都很常见。为了第二份副本把整个服务
 *   起不来（连第一份也用不了）是把「降级」变成了「全停」，方向反了。
 *   返回那条警告文案，让调用方决定怎么记（时钟与 logger 都不在这里）。
 *
 * `mirrorDir` 为空时不创建、也不报错 —— 那是「用户还没指定第二份存储」的正常状态。
 */
export function ensureDirectories(config: ServerConfig): { mirrorWarning: string | null } {
  mkdirSync(config.dataDir, { recursive: true });

  if (config.mirrorDir.trim() === '') return { mirrorWarning: null };

  try {
    mkdirSync(config.mirrorDir, { recursive: true });
    return { mirrorWarning: null };
  } catch (error) {
    return {
      mirrorWarning:
        `第二份存储目录建不出来（${config.mirrorDir}）：` +
        `${error instanceof Error ? error.message : String(error)}。` +
        '同步照常进行，但第二份副本暂时写不了 —— 挂上那块盘之后会自己恢复。',
    };
  }
}

/**
 * 这个 origin 是否被放行。
 *
 * 支持配置里写 `http://localhost:*` 这种端口通配 —— 应用可能跑在 5173、4173 或别的端口。
 * 只做「协议 + 主机 + 端口」的字符串匹配，不引入 URL 解析，避免 `null` / 畸形 origin 抛错。
 */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  for (const pattern of allowed) {
    if (pattern === origin) return true;
    if (pattern.endsWith(':*') && origin.startsWith(`${pattern.slice(0, -1)}`)) {
      // `http://localhost:*` → 前缀 `http://localhost:`，且后面必须是纯数字端口
      const rest = origin.slice(pattern.length - 1);
      if (/^\d+$/.test(rest)) return true;
    }
  }
  return false;
}
