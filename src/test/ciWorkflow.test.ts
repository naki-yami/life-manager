import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CI 工作流的静态校验。
 *
 * `.github/workflows/ci.yml` 是唯一一份本地永远不会跑到的东西：本地 `npm run` 全绿，
 * CI 照样可能整个红。已经踩过的坑是同一个映射里写了两个 `run:` —— YAML 解析直接崩，
 * GitHub 判成 0 秒失败，日志里连一行有用的都没有（这个 bug 一直躺着，因为以前没有远端）。
 * 所以把「键有没有重复」「步骤顺序」「引用的脚本真的存在」都钉在这里。
 */

const ROOT = resolve(process.cwd());
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

interface PackageJson {
  scripts: Record<string, string>;
}

const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson;

interface KeyLocation {
  key: string;
  line: number;
}

interface Scope {
  indent: number;
  keys: Set<string>;
}

/**
 * 找出同一个映射里重复出现的键。
 *
 * 刻意不引 js-yaml：它只是别人带的传递依赖，哪天上游一变就没了，
 * 而这条测试要长期活着。本项目的工作流只用到「块映射 + `- ` 序列项」两种写法，
 * 用缩进比较这一个规则就能覆盖。
 */
function findDuplicateKeys(text: string): KeyLocation[] {
  const duplicates: KeyLocation[] = [];
  const scopes: Scope[] = [];

  text.split('\n').forEach((raw, index) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;

    const isItem = trimmed.startsWith('- ') || trimmed === '-';
    const body = isItem ? trimmed.replace(/^-\s*/, '') : trimmed;
    // `- name: x` 里的键要从 `-` 之后再起算，否则同一步里的两个键会被当成兄弟
    const indent = isItem
      ? raw.length - raw.trimStart().length + (trimmed.length - body.length)
      : raw.length - raw.trimStart().length;

    const match = /^([^:\s][^:]*):(\s|$)/.exec(body);
    if (match === null) return;
    const key = match[1].trim();

    // 新的序列项开启一个新的映射；普通行只在缩进回退时才关掉当前映射
    while (scopes.length > 0) {
      const top = scopes[scopes.length - 1];
      if (isItem ? top.indent >= indent : top.indent > indent) scopes.pop();
      else break;
    }

    const current = scopes[scopes.length - 1];
    if (current !== undefined && current.indent === indent) {
      if (current.keys.has(key)) duplicates.push({ key, line: index + 1 });
      current.keys.add(key);
    } else {
      scopes.push({ indent, keys: new Set([key]) });
    }
  });

  return duplicates;
}

describe('.github/workflows/ci.yml', () => {
  it('没有重复的映射键（重复键会让整个工作流解析失败）', () => {
    expect(findDuplicateKeys(workflow)).toEqual([]);
  });

  it('重复键扫描器本身能抓到问题（拿坏样例验一下）', () => {
    const broken = ['jobs:', '  verify:', '    steps:', '      - run: a', '        run: b'].join(
      '\n',
    );
    expect(findDuplicateKeys(broken)).toEqual([{ key: 'run', line: 5 }]);
  });

  it('质检步骤的顺序与 package.json 里的质量门一致', () => {
    const runs = [...workflow.matchAll(/run:\s*(npm run [a-z:]+)/g)].map((match) => match[1]);
    expect(runs).toEqual([
      'npm run typecheck',
      'npm run lint',
      'npm run format:check',
      'npm run test',
      'npm run build',
      'npm run size',
    ]);
  });

  it('引用的每个 npm 脚本都真的存在', () => {
    const scripts = [...workflow.matchAll(/npm run ([a-z:]+)/g)].map((match) => match[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const name of scripts) {
      expect(Object.keys(packageJson.scripts)).toContain(name);
    }
  });

  it('在 Node 22 上跑，并复用 npm 缓存', () => {
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('cache: npm');
  });

  it('只用官方 actions，并钉在带大版本号的 tag 上', () => {
    const refs = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      // 不引第三方 action（供应链面越小越好），也不跟分支（@main 会静默漂移）
      expect(ref).toMatch(/^actions\/[\w-]+@v\d+$/);
    }
  });

  it('两个 action 都在当前主版本上', () => {
    // 这条写死是有意的：升主版本时这里会红，逼人确认一遍再改。
    // v4 打的是 Node 20，跑起来会被弃用警告刷屏（v5 起改用 Node 24）。
    const refs = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
    expect(refs).toEqual(['actions/checkout@v7', 'actions/setup-node@v7']);
  });
});
