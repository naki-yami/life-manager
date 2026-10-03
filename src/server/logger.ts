/**
 * 按行日志。
 *
 * 服务端没有界面，出问题时人只能看这个窗口 —— 所以格式固定、一行一件事、带时间戳，
 * 不用彩色、不用分级图标（Windows 的 cmd 窗口里颜色不一定渲染得出来）。
 *
 * 写入目标是可注入的：测试要断言「日志里出现了某句话」（例如放开 0.0.0.0 的重复提醒、
 * mirrorDir 同卷告警），不该去抓真 stdout。
 */
export type LogSink = (line: string) => void;

export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

function timestamp(now: Date): string {
  // 本地时间、秒级。日志是给人看的，不是给机器解析的，所以不用 ISO/UTC。
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/**
 * 建一个 logger。
 *
 * `now` 可注入是为了让测试拿到稳定的时间戳（否则断言里得写正则）。
 */
export function createLogger(
  sink: LogSink = (line) => process.stdout.write(`${line}\n`),
  now: () => Date = () => new Date(),
): Logger {
  const write = (level: string, message: string): void => {
    sink(`${timestamp(now())} [${level}] ${message}`);
  };
  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
  };
}
