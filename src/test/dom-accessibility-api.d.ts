/*
 * dom-accessibility-api 的 package.json 没有在 exports 里声明 types 字段，
 * 在 moduleResolution: bundler 下 TypeScript 解析不到它自带的 .d.ts。
 * 这里只补齐无障碍测试用到的那一个函数签名。
 */
declare module 'dom-accessibility-api' {
  export function computeAccessibleName(root: Element): string;
}
