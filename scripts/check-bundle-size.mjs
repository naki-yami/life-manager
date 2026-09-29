/**
 * 首屏体积预算。
 *
 * 「首屏」= 入口 JS + 入口 CSS + 首页路由 chunk，也就是打开应用、落在首页时
 * 真正要下载的东西。路由是按页面懒加载的，所以别的模块长大不会体现在这个数字上，
 * 它一旦超标就说明入口这一层出了变化（新依赖、被误打进主包的大组件）。
 *
 * 用法：npm run build && npm run size（CI 里紧跟 build 之后跑）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** 首屏 gzip 上限。当前实测约 134KB，留出 2 倍以上余量，只拦「明显失控」 */
const BUDGET_BYTES = 300 * 1024;

const assetsDir = join(process.cwd(), 'dist', 'assets');

/** 首页 chunk 的名字跟着路由组件的文件名走，改文件名时同步这里 */
const FIRST_SCREEN = [
  { pattern: /^index-[\w-]+\.js$/, label: '入口 JS' },
  { pattern: /^index-[\w-]+\.css$/, label: '入口 CSS' },
  { pattern: /^HomePage-[\w-]+\.js$/, label: '首页 chunk' },
];

let files;
try {
  files = readdirSync(assetsDir);
} catch {
  console.error(`找不到 ${assetsDir}，请先跑 npm run build。`);
  process.exit(1);
}

const rows = [];
let total = 0;

for (const { pattern, label } of FIRST_SCREEN) {
  const name = files.find((file) => pattern.test(file));
  if (!name) {
    console.error(`首屏预算：没找到「${label}」（${pattern}），打包产物结构变了？`);
    process.exit(1);
  }
  const path = join(assetsDir, name);
  const gzipped = gzipSync(readFileSync(path)).length;
  total += gzipped;
  rows.push({ label, name, raw: statSync(path).size, gzip: gzipped });
}

const format = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

console.log('首屏体积（gzip）：');
for (const row of rows) {
  console.log(`  ${row.label.padEnd(10)} ${row.name.padEnd(24)} ${format(row.gzip)}`);
}
console.log(
  `  ${'合计'.padEnd(10)} ${''.padEnd(24)} ${format(total)} / 预算 ${format(BUDGET_BYTES)}`,
);

if (total > BUDGET_BYTES) {
  console.error(`\n首屏体积超出预算：${format(total)} > ${format(BUDGET_BYTES)}`);
  process.exit(1);
}
