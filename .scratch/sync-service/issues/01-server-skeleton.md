# 01 进程骨架、配置与鉴权

Status: resolved
实现：`6d2e535`（2026-10-02。`src/server/` 五个模块 + 四个测试文件；验收用例：
`http.test.ts` 的 health 免令牌 / 401 且不写数据 / CORS / 畸形 Host 打不挂进程，
`config.test.ts` 的首次生成与 origin 匹配，`main.test.ts` 的放开监听重复提醒与令牌
只打印一次，`schemas-parity.test.ts` 的模块清单防漂移）。
Type: task
Part of: `.scratch/sync-service/spec.md`
Blocked by: 无

## 目标

`node src/server/main.ts` 能起一个只听 `127.0.0.1` 的零依赖 HTTP 服务：加载 / 生成配置、用预共享
令牌鉴权、放行本机 origin、应答 `/v1/health`、按行记日志，并附一个启动用的 `.bat`。
零新依赖（只用 `node:http` / `node:fs` / `node:crypto` / `node:path`）。

## 改动点

- 新增 `src/server/main.ts`（启动入口）、`src/server/config.ts`（`config.json` 读写与默认值）、
  `src/server/http.ts`（路由 + JSON 收发 + CORS）、`src/server/auth.ts`（Bearer 校验）、
  `src/server/logger.ts`（按行日志）。
- `config.json` 字段：`port`、`host`（默认 `127.0.0.1`）、`token`、`dataDir`、`mirrorDir`、
  `allowedOrigins`。首次启动没有 `config.json` 时生成：
  `token = crypto.randomBytes(32).toString('hex')`，并在控制台打印一次。
- 放 `src/server/` 而不是仓库根的 `server/`：`tsc -b`、`eslint .`、vitest 的 `src/**` 三处配置
  不用改，浏览器包也不受影响（Vite 只打包入口可达的模块）。
- 启动脚本 `.bat`（放 `src/server/` 下）负责 `node src/server/main.ts` 并把日志留在窗口里。
- 测试放 `src/server/*.test.ts`，文件头写 `// @vitest-environment node`。

## 验收

- `/v1/health` 无需令牌，返回 `{ ok, seq, schemaVersion, modules }`；此时 `seq = 0`，
  `modules` 用备份模块名。
- 其余路径缺令牌 / 错令牌 → `401`，且**不写任何数据**。
- CORS 默认放行 `http://localhost:*` 与 `http://127.0.0.1:*`；其它 origin 不带放行头。
- 默认不监听 `0.0.0.0`；显式配置放开时启动日志里有重复提醒。
- `npm run typecheck && npm run lint && npm run format:check && npm run test` 全绿。

## 测试

真 `node:http` 监听 `127.0.0.1:0`（随机端口），数据目录用 `os.tmpdir()` 下的临时目录，
不起浏览器、不碰 jsdom。断言按「发一个请求 → 看响应」，不测内部函数名。

## 不做

副本文件的读写与形状（工单 02）；push / changes / snapshot / restore；mirrorDir 的落盘逻辑。
