/**
 * 同步服务端入口：`node src/server/main.ts`
 *
 * 零新依赖，只用 `node:*` 内建。默认只绑 `127.0.0.1` —— 服务的是「你自己这台机器上的
 * 浏览器」，不是公网。放开监听地址需要显式改配置，且启动日志里会重复提醒。
 *
 * **需要 Node 22.6+**（直接运行 `.ts` 靠的是 Node 的类型擦除；23.6+ 默认开启，22.6 需要
 * `--experimental-strip-types`）。本机验证版本 v24。用 Node 18/20 会在启动时就失败。
 *
 * 见 `docs/adr/0002-跨设备同步以本机服务实现，纯本地降为默认.md` 与
 * `.scratch/sync-service/spec.md`。工单 01 只做骨架：配置、鉴权、CORS、日志、`/v1/health`。
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadOrCreateConfig, ensureDirectories, DEFAULT_HOST } from './config.ts';
import { createLogger, type Logger } from './logger.ts';
import { createRequestHandler } from './http.ts';
import { loadReplica } from './replica.ts';
import { purgeTombstones } from './tombstones.ts';

/** Windows 上 `127.0.0.1` 是回环；`0.0.0.0` / `::` 是「所有网卡」，等于把服务暴露到局域网。 */
function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

/**
 * 启动横幅与告警。抽成函数是为了让测试直接断言，
 * 不必去抓真 stdout（spec Testing 第 9 条要「启动日志里出现告警」）。
 */
export function startupMessages(
  host: string,
  port: number,
  mirrorDir: string,
  dataDir: string,
  created: boolean,
  token: string,
): { lines: Array<{ level: 'info' | 'warn'; message: string }> } {
  const lines: Array<{ level: 'info' | 'warn'; message: string }> = [];

  lines.push({ level: 'info', message: `Life Manager 同步服务启动：http://${host}:${port}` });
  lines.push({ level: 'info', message: `数据目录：${dataDir}` });
  lines.push({
    level: 'info',
    message: `第二份存储（mirrorDir）：${mirrorDir.trim() === '' ? '未配置 —— 建议尽早指定一个离开本机的目录' : mirrorDir}`,
  });

  if (created) {
    // 只在首次生成时打印一次。每次启动都打会把密钥刷进日志文件。
    lines.push({ level: 'warn', message: `已生成访问令牌（只显示这一次，请存好）：${token}` });
  } else {
    lines.push({ level: 'info', message: '访问令牌已从 config.json 读取（不在此显示）' });
  }

  if (!isLoopbackHost(host)) {
    // 「放开监听」是 ADR 的暴露面红线，必须显眼、且说两遍 —— 一句容易被滚屏冲掉。
    lines.push({
      level: 'warn',
      message: `监听地址是 ${host}，不是回环 —— 这台机器上的同步服务将可被局域网内其它设备访问。`,
    });
    lines.push({
      level: 'warn',
      message:
        '若不是有意为之，请把 config.json 的 host 改回 127.0.0.1；局域网访问还需要自行解决证书与鉴权强度问题。',
    });
  }

  return { lines };
}

export function startServer(options: { configPath?: string; logger?: Logger } = {}): {
  server: ReturnType<typeof createServer>;
  port: number;
  log: Logger;
} {
  const log = options.logger ?? createLogger();
  const { config, created } = loadOrCreateConfig(options.configPath);
  ensureDirectories(config);

  for (const line of startupMessages(
    config.host,
    config.port,
    config.mirrorDir,
    config.dataDir,
    created,
    config.token,
  ).lines) {
    if (line.level === 'warn') log.warn(line.message);
    else log.info(line.message);
  }

  // 载入副本（工单 02）。没有就生成一份 seq=0 的并落盘；半写文件会用 backups/ 里的顶上。
  const { replica, created: replicaCreated } = loadReplica({
    dataDir: config.dataDir,
    onWarn: (message) => log.warn(message),
  });
  if (replicaCreated) log.info('已新建空副本');
  log.info(`副本就绪：seq=${replica.envelope.sync.seq}`);

  /*
   * 每次 push 之后顺手清墓碑（工单 05）。
   *
   * 放在 push 之后而不是定时任务里：墓碑只在「又有设备动过」时才可能变得可清
   * （要么所有设备都拉过了、要么超了 90 天），没有写入时清理不会改变结果。
   * 清理动作本身很便宜（遍历几十条），且只在真有可清的东西时才推水位。
   */
  const purgeAfterWrite = (): void => {
    try {
      const result = purgeTombstones(replica.envelope);
      if (result.purgedTombstones > 0) {
        log.info(
          `清理墓碑 ${result.purgedTombstones} 条，裁掉变更日志 ${result.trimmedChanges} 条，` +
            `水位推到 ${result.purgedThroughSeq}`,
        );
      }
    } catch (error) {
      // 清理失败不该影响这次写入的结果
      log.warn(`清理墓碑失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handler = createRequestHandler({
    config,
    logger: log,
    replica,
    onAfterWrite: purgeAfterWrite,
  });

  const server = createServer((req, res) => {
    // 兜底：处理器里任何漏网的异常都不该打死进程。按 ADR-0002 这个服务是无人值守跑在
    // 用户机器上的，被远程打停等于同步静默失效 —— 记一行日志、回 500，继续服务下一个请求。
    try {
      handler(req, res);
    } catch (error) {
      log.error(
        `处理 ${req.method} ${req.url ?? ''} 时抛错：${error instanceof Error ? error.message : String(error)}`,
      );
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      res.end(JSON.stringify({ error: 'internal_error' }));
    }
  });
  server.listen(config.port, config.host, () => {
    log.info('就绪。按 Ctrl+C 停止。');
  });
  // 端口被占之类的问题要让进程退出并说清原因，而不是静默半死
  server.on('error', (error) => {
    log.error(`启动失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
  // 客户端发来畸形请求（坏头、乱码请求行）时 Node 会发 'clientError'；
  // 不接住它，默认行为会直接销毁 socket 而不给任何可排查的线索。
  server.on('clientError', (error, socket) => {
    log.warn(`客户端请求有误：${error instanceof Error ? error.message : String(error)}`);
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  return { server, port: config.port, log };
}

/** 只在作为入口直接运行时启动；被 import 时不自动监听（测试要自己控制端口）。 */
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  startServer();
}

export { DEFAULT_HOST };
