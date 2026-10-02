# 开发工作重构 + 全站动效 + 双皮肤 方案

参考基线：`D:\WorkBuddy\my-own-app`（木子工作台）的左栏+详情布局、动效 token 体系、皮肤机制；全部用纯 CSS 落地，**不加任何新依赖**。按 AGENTS.md 每步一个 commit，每步交付前 typecheck / lint / prettier / vitest / e2e 全绿。

---

## 第 1 步：双皮肤系统（流光玻璃 = 新默认，纸面扁平 = 可切回）

机制与木子同源：`useTheme` 往 `<html>` 写 `data-appearance`（`glass` | `paper`），token 层整体切换。

- `src/store/themeStore.ts`：加 `appearance` 字段（zod `.default('glass')` + `.catch('glass')`，老存档平滑升级到玻璃）；`useTheme.ts` 同步写/删 `dataset.appearance`。
- `src/styles/tokens.css`：现有值归入 `[data-appearance='paper']`（含 `.dark`）；新增 `[data-appearance='glass']` 覆盖块（明暗两套）——画布改环境色渐变（用现有 accent 变量做极淡光晕）、表面改半透明 + 发丝线、elevated 层加 `--lm-blur`；`[data-accent]` 只管 accent 变量，与皮肤块不冲突，5 个主题色继续可用。
- `src/styles/index.css`：玻璃皮专属微调（body 渐变背景、StatStrip 数字强调、`backdrop-filter` 只用于 Header / 项目栏 / Modal / Drawer 等粘性浮层，避免全站毛玻璃的性能税）。
- `src/pages/SettingsPage.tsx`：外观卡加「界面皮肤」SegmentedControl（流光玻璃 / 纸面扁平），随备份导出（themeStore 已在导出链上）。
- `src/styles/tokens.test.ts`：对比度断言扩展到两套皮肤各自的覆盖块，WCAG 锁不放松。

## 第 2 步：全站克制动效（纯 CSS，尊重 prefers-reduced-motion）

- `tailwind.config.js`：加 `page-in`（淡入 + 上浮 6px，~230ms，现有 ease-standard）与 `breathe`（状态点呼吸 ~2.6s）两组 keyframes。
- `src/styles/index.css`：`.stagger-enter > *` 级联进场工具类（逐项 +45ms，封顶 10 项）；全局 `@media (prefers-reduced-motion: reduce)` 兜底（动画/过渡压到 0.01ms），作为现有逐组件 `motion-reduce:` 之外的双保险。
- `src/components/layout/Layout.tsx`：`<main key={pathname}>` 挂 `animate-page-in`，路由切换即页面入场；`Sidebar` 收起时标签淡出；卡片/列表行挂 `hover:-translate-y-px` / 行 `hover:translate-x-0.5` 微抬升（Card、StatStrip、rail 按钮、任务行）。
- 看板补拖拽高亮过渡（列边框颜色过渡 + 拖拽卡阴影），进行中状态点用 `animate-breathe`。
- 不做：数字滚动、背景视差漂移、弹簧侧栏（华丽级效果，与「克制」决定不符）。

## 第 3 步：开发模块数据模型 + 跨模块推送

- `src/types/index.ts` + `src/services/schemas.ts`（v11）：`DevTask` 加 `milestoneId: string | null`、`dueDate: string | null`（zod default + normalize 补齐，旧存档/旧备份兼容）；`Task` 加可选 `ref?: { module: 'dev'; projectId: string; projectTitle: string }`。
- `src/store/devStore.ts`：`addTask` 支持附加字段；新增 `updateTask(id, patch)`；删除里程碑时关联工作项的 `milestoneId` 置 null（对齐木子的 ON DELETE SET NULL）。
- 新增 `src/services/devPush.ts`：`pushDevTaskToToday(project, task)` → 调 `taskStore.addTask`（dueDate=今天，带 ref 回链），幂等防重复推送；单测覆盖。

## 第 4 步：开发工作页重构（木子式左栏 + 右详情，单页化）

新 `src/pages/DevPage.tsx` + 新目录 `src/components/dev/`（ProjectRail / ProjectHero / MilestoneGrid / WorkItemList / DevLogList / InvestmentCard）：

- **布局**：`lg:` 起 `grid-cols-[248px_minmax(0,1fr)]`，左栏 sticky 滚动跟随；`<lg` 左栏变横向滚动项目胶囊条，详情全宽纵排；375px 不产生页面横向溢出（e2e 锁着）。
- **左项目栏**：紧凑项目按钮（名称 + 呼吸状态点 + 迷你进度条 + 停滞标记）＋搜索框＋状态筛选（六项含「已归档」，保留现有测试语义）＋「新建项目」；选中项 accent 高亮。
- **右详情**（始终有选中项目；空库走现有空态引导）：
  - Hero：项目名、状态 Select、描述、技术栈/就地补标签、仓库链接、周期、进度条、停滞徽章；「编辑」改为详情内联展开表单（替代原宽屏右栏编辑表单）；记录工时 / 归档 / 删除（确认 + 可撤销）全保留。
  - 项目概览 StatStrip：累计工时、任务完成率、里程碑进度、停滞天数。
  - 里程碑：双列磁贴网格 + 进度，行内添加/勾选/删除。
  - 工作项：头部 = 计数 + **列表/看板 SegmentedControl** + **未完成/Bug/全部筛选** + 行内添加（标题/优先级/类型/关联里程碑/截止日期）。列表视图 = 紧凑行（勾选、类型图标、标题 + 「◆里程碑 · 截止 · 优先级」副行、逾期红标、**推送今日计划**按钮、删除）；看板视图 = 现有 KanbanBoard 三列拖拽，窄屏列横向滚动。
  - 开发日志：日期 + 内容，行内记一笔，倒序。
  - 近期投入：改为**按项目**统计（近 8 周柱图 + 最近流水）；全站汇总数字收进页头一行小字。
- **路由**：`/dev/:id` 重定向到 `/dev?project=:id`（旧链接兼容）；`DevProjectPage.tsx` 及其测试下线（约 780 行收编进组件）。
- 锁定行为全部保留：14 天停滞徽章、归档筛选、删除撤销（项目/任务/工时流水）、工时与 hoursSpent 联动、空态文案、搜索命中任务标题与 #标签。

## 第 5 步：今日计划来源回链

- `TasksPage` 有 `ref` 的任务行显示「开发 · 项目名」小徽章，点击跳 `/dev?project=id`；旧数据无字段不受影响。补对应单测。

## 第 6 步：e2e、文档、收口验证

- e2e：routes 用例补 `/dev/:id` 重定向；新增「左栏切项目 → 详情联动」冒烟；mobile 用例确认 375px 无溢出（横向胶囊条/看板都在内层滚动容器里）；其余 32 条保持全过。
- 测试改造：`DevPage.test.tsx` 按新布局重写（选择/筛选/搜索/内联编辑/推送/视图切换/里程碑关联/逾期标记），删 `DevProjectPage.test.tsx`，补 devStore / schemas / normalize / themeStore / tokens（双皮肤）/ devPush 用例。
- `README.md`（功能表、皮肤一节、定版读数重跑回填）、`CONTEXT.md`（皮肤/项目栏等词条）更新。
- 最终全量门：`typecheck / lint / format:check / test / e2e / size` + 构建 preview 后按交付流程过视觉验收（首页、开发页、设置页、375 移动端）。

## 明确不做（本轮）

- Neo 粗野主义第三皮肤、动画库、数字滚动/视差等华丽动效、开发页「打开本地文件夹」（纯浏览器无后端做不到）、工作项指派人/估算。

## Commit 切分

1. `feat(theme)` 双皮肤机制 + 玻璃默认皮
2. `feat(motion)` 全站克制动效
3. `feat(dev)` 数据模型 + 推送服务
4. `feat(dev)` 开发页木子式重构（含路由重定向）
5. `feat(tasks)` 今日计划回链徽章
6. `test(e2e)+docs` e2e 补齐 + README/CONTEXT 收口
