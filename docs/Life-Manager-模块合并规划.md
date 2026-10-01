# Life Manager 模块合并规划

> 目标：主导航从 **13 项收敛到 8 项**，把语义相近的模块归组。
> 铁律：**只动信息架构（路由 / 导航 / 页面容器），不动数据层** —— 所有 store、schema、
> 备份模块、存储键保持原样，合并前后数据与功能零变化。

---

## 1. 合并映射（13 → 8）

| 新模块（宿主路由） | 子页（原路由） | 子页签名（不变） |
| --- | --- | --- |
| 首页总览 `/` | — | — |
| 今日计划 `/tasks` | — | — |
| **读书与写作** `/study` | 读书 `/study/books`（原 `/books`）<br>写作 `/study/writing`（原 `/writing`） | 读书 / 写作 |
| 开发工作 `/dev`（不动，含 `/dev/:id`） | — | — |
| **健康** `/health` | 健身 `/health/fitness`（原 `/fitness`）<br>饮食 `/health/diet`（原 `/diet`） | 健身 / 饮食 |
| 游戏娱乐 `/games`（不动） | — | — |
| **统计与复盘** `/insight` | 统计 `/insight/stats`（原 `/stats`）<br>复盘 `/insight/review`（原 `/review`） | 统计 / 复盘 |
| **成长** `/growth` | 习惯 `/growth/habits`（原 `/habits`）<br>目标 `/growth/goals`（原 `/goals`）<br>日记 `/growth/journal`（原 `/journal`） | 习惯 / 目标 / 日记与心情 |
| 数据与设置 `/settings`（system 组，不动） | — | — |

**命名备选**（实施前定稿，改一个字符串即可）：
- `/study`：读书与写作 ｜ 备选：书房、读写
- `/health`：健康 ｜ 备选：健身与饮食、身体
- `/insight`：统计与复盘 ｜ 备选：洞察
- `/growth`：成长 ｜ 备选：自律

---

## 2. 技术方案

### 2.1 宿主页 + 嵌套子路由（路线 A，推荐）

```tsx
<Route path="/study" element={<StudyLayout />}>
  <Route index element={<Navigate to="books" replace />} />
  <Route path="books" element={<BooksPage />} />
  <Route path="writing" element={<WritingPage />} />
</Route>
{/* 旧路径保底重定向，书签与外部链接不碎 */}
<Route path="/books" element={<Navigate to="/study/books" replace />} />
<Route path="/writing" element={<Navigate to="/study/writing" replace />} />
```

- 每组合并新增一个**薄宿主组件**（约 30 行）：只渲染「子页签条 + `<Outlet />`」，
  **不放组名 h1**——子页面保留自己的 PageHeader，a11y 基线（每页唯一 h1）不破。
- 子页签条是共用新组件 `ModuleTabs`（包一层 SegmentedControl，当前项从 location 推导，
  点击走 navigate）。
- 子页面组件**零改动**：它们不知道自己被嵌套了。

**为什么不用路线 B（原路由不变，页内互相挂兄弟链接）**：URL 不分层，命令面板 / 底部 Tab /
g+数字 的收敛都要靠特判；嵌套路由一次到位，后续「健康页跨健身饮食的日历联动」也有挂载点。

### 2.2 数据层：零改动

- 9 个 store、`schemas.ts`、备份 21 个模块、`lm:` 存储键全部原样；
- 不新增任何持久化字段（子页签当前项从 URL 推导，不入库）；
- 合并前后导出文件逐字节同构。

### 2.3 导航与入口收敛

| 入口 | 改动 |
| --- | --- |
| `navItems.ts` | 13 → 8 条 main；keywords 合并两组（如「读书 写作 reading writing」指向宿主）；宿主 `path` 指向默认子路由 |
| 侧栏 / 移动抽屉 | 复用 NAV_ITEMS，自动收敛 |
| 移动端底部 Tab | 「习惯」位改「成长」；「更多」抽屉自动生效 |
| `g+数字` | 新映射：1 首页 2 今日计划 3 读书与写作 4 开发 5 健康 6 游戏 7 统计与复盘 8 成长（main 只剩 8 项，快捷键表同步） |
| 命令面板 | NAV_ITEMS 驱动，自动收敛；keywords 已含两组词 |
| 首页仪表盘 | widget 的跳转 path 改新地址（如读书 widget → `/study/books`），widget 本身不动 |
| 页内互跳 | 复盘页 / 目标页里指向 `/stats`、`/habits` 的链接改为新路径 |

### 2.4 引用点扫描清单（实施时逐项 grep）

`grep -rn "'/books'\|'/writing'\|'/fitness'\|'/diet'\|'/stats'\|'/review'\|'/goals'\|'/habits'\|'/journal'" src e2e`
预计命中：navItems、dashboard widget 配置、goals/review 的跳转按钮、
单测的 MemoryRouter initialEntries、e2e 的 goto 与断言、快捷键说明表（设置页）。
**旧路径全部保留重定向**，所以漏改一处也不会 404，只会多一跳。

---

## 3. 分阶段提交计划（每阶段独立 commit + 质量门全绿）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| 一（打样） | 读书+写作：StudyLayout、ModuleTabs、路由改造、旧路径重定向、navItems | 全绿；`/books` 30x 到 `/study/books`；宿主内两子页可切；a11y 基线不破 |
| 二 | 健康（健身+饮食），同一模式 | 同上 |
| 三 | 统计与复盘 | 同上 |
| 四 | 成长（习惯+目标+日记，三合一） | 同上 |
| 五（收尾） | g+数字重排与快捷键表、底部 Tab 校对、首页 widget 路径、命令面板 keywords、e2e 用例更新、README 与本规划的进度回填 | e2e 相关用例全过；grep 扫描无残留旧路径直链 |

每个阶段结束时：`typecheck / lint / test / build / size` 五连全绿 + 一次无头浏览器冒烟
（复用 e2e 工具，重点断言零未捕获异常）。

---

## 4. 风险与克制

1. **数据零风险**：全程不碰 store / schema / 备份；最坏情况回滚也只是导航层。
2. **页面文件不搬目录**：宿主只是容器，import 关系基本不变，diff 可控。
3. **旧路径不删**：全部 `Navigate replace` 重定向，书签、e2e、文档里的旧链接软着陆。
4. **a11y 不回退**：宿主无 h1、子页签条带 role=group + aria-label、当前项 aria-pressed；
   每阶段跑无障碍基线用例。
5. **首屏体积**：新增四个宿主组件都是几十行薄壳，忽略不计；红线 ≤300KB 不变。
6. **刻意不做**：不合并 store、不改任何页面内部交互、不在这一轮做「健康页跨健身/饮食
   的日历联动」（合并后才有干净的挂载点，列为合并后的可选增强）。

---

## 5. 待确认（实施前定）

1. 四个新模块的命名（用第 1 节的推荐还是备选）；
2. 子页签条的位置：内容区顶部（推荐，紧贴 PageHeader 下方）还是 PageHeader 的 actions 区；
3. 旧路径重定向保留多久——建议永久保留（成本为零）。

确认后按阶段一 → 五推进，每个阶段交付一次。
