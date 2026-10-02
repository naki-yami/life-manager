# Life Manager 全面优化提示词

**项目路径**：`E:\MyApp`　|　**访问地址**：http://localhost:5173
**技术栈**：Vite 6 + React 18 + TypeScript 5 + Tailwind CSS 3 + zustand 5 (persist) + React Router 6 + lucide-react + date-fns
**当前规模**：9 个模块页面（首页 / 今日计划 / 读书 / 开发 / 写作 / 健身 / 饮食 / 游戏 / 设置）、5 个基础 UI 组件、8 个 zustand store、约 1600 行源码
**本文档定位**：一份可直接投喂给 AI 编码 Agent（Codex / Claude Code / Cursor / Windsurf）的优化任务书

> **历史存档（写于 V1 优化之前）**：正文里的定位与存储约束已被后续决策取代 ——
> 「不引入后端、不外调云 API」见 `docs/adr/0002-跨设备同步以本机服务实现，纯本地降为默认.md`
> （纯本地降为默认形态、跨设备同步可选开启，默认关闭时仍是零网络请求）；存储已从 localStorage
> 迁到 IndexedDB 为主（V2.1）。要重新投喂这份任务书时，先按这两条现状改写。

---

## 0. 使用说明

- **推荐方式**：按第 11 节的阶段 P0 → P5 **逐段执行**，每阶段结束时用第 12 节验收清单自检，通过后再进入下一阶段。一次性投喂全部内容，只适合上下文窗口极大且稳定的模型。
- **投喂格式**：把「第 1 节 ~ 第 13 节」整段复制，末尾接一句"请先复述你的理解与第一阶段计划，等我确认后再改代码"。
- **单模块迭代**：只想优化某一个页面时，用附录 B 的模板 + 第 5/6/7 节作为固定前缀。
- **代码复核**：改完想让另一个 Agent 挑刺，用附录 C。

---

## 1. 角色与总目标

你是一名**资深前端工程师 + 产品设计师**，负责把一个"功能骨架已经跑通、但视觉与交互还很简陋"的个人应用，升级到**可日常使用、体验接近 Linear / Notion / Raycast 水准**的产品。

三个并重的目标：

1. **视觉**：建立完整设计系统（色彩 / 字号 / 间距 / 圆角 / 阴影 / 动效），亮暗双主题都精致，页面信息层级清晰、留白得体。
2. **交互**：所有操作有即时反馈，所有危险操作有确认与撤销，键盘可用，动效克制不炫技。
3. **功能**：每个模块在原有 CRUD 之上补齐"真正好用的那 30%"（见第 8 节），并加固数据层，保证导入导出无损、旧数据可迁移。

**成功标准**：打开首页 3 秒内知道"今天该干什么"；在任何模块都能用不超过 2 次点击完成最常用的操作。

---

## 2. 项目现状快照（已核实，无需重新探索）

```
E:/MyApp
├── AGENTS.md                  # 要求：每次改动必须 commit + 必须写测试
├── docs/产品设计文档.md        # 最初的产品定位与各模块功能清单
├── docs/技术方案.md
├── src/App.tsx                # 9 条路由，未做 lazy 分包
├── src/components/layout/     # Layout / Header / Sidebar（侧栏固定 224px，不可折叠）
├── src/components/ui/         # Button / Card / Input / Modal / Select（仅 5 个，状态不全）
├── src/hooks/useTheme.ts
├── src/pages/*.tsx            # 9 个页面，每页 129-187 行，均为「卡片列表 + 弹窗表单」
├── src/store/*.ts             # 8 个 store，persist 无 version/migrate
├── src/styles/index.css       # 仅 23 行，只有滚动条与字体
├── src/types/index.ts         # 124 行类型定义
└── src/utils/helpers.ts       # 3 行，generateId 用时间戳+随机数
```

**关键事实**：无测试、无 ESLint/Prettier、无 ErrorBoundary、无 Toast、无图表、无热力图、无搜索、无快捷键、无拖拽、无虚拟列表；Tailwind 主题只扩展了 `primary` 一个色阶，其余全部直接使用 `gray-*` 硬编码；统计数字未使用 `tabular-nums`。

---

## 3. 硬性约束与红线

1. 保持**默认纯本地**：不要求登录，默认不联网也不上云，所有数据留在浏览器。（**这条已被 `docs/adr/0002` 取代**：纯本地从硬约束降为默认形态，跨设备同步可选开启；默认关闭时仍是零网络请求。）
2. **不允许丢失用户数据**：任何存储结构变更必须提供 `migrate`，旧数据读取后自动升级，不得静默丢弃。
3. **禁止 `localStorage.clear()`**：它会把同源下其他项目的数据一起清掉。只删除本项目自己的 key。
4. **不要一次性大重写**：分阶段交付，每个阶段结束后 `npm run dev` 必须能正常跑、现有数据必须还能用。
5. **不引入 CDN 资源**：字体用系统字体栈或 `@fontsource/*` 本地打包；图标继续用 `lucide-react`；不要外链图片。
6. **依赖克制**：新增依赖前先说明理由与体积（gzip 估算）。优先用现有依赖（date-fns / lucide-react / tailwind）能解决的方案。
7. **不改产品定位**：个人使用、桌面浏览器优先、中文界面。移动端只做"不崩、能看"的降级，不投入大量精力。
8. **遵守仓库 `AGENTS.md`**：每次改动完成后必须创建一个 Git commit；每次改动后必须编写/更新测试，交付前确保测试全绿。**注意：当前仓库一个测试都没有，测试基建本身就是 P0 任务之一。**
9. 只做**深化**，不做方向性改变；不修改 `docs/产品设计文档.md` 已声明的产品定位。
10. 所有新增代码必须 **TypeScript 严格类型**，禁止 `any`（现有代码里的 `(t: any)` 等要在重构中清掉）。

---

## 4. P0：已知缺陷清单（必须先修，再谈美化）

以下问题已在源码中核实，按影响排序，**修复优先级高于一切视觉工作**：

| # | 位置 | 问题 | 后果 |
| --- | --- | --- | --- |
| 1 | `src/pages/SettingsPage.tsx:96` | `handleClearAll()` 调用 `localStorage.clear()` | 清掉同源下**所有**站点的数据（其他本地项目的进度全部丢失） |
| 2 | `src/pages/SettingsPage.tsx:61` | 导入任务时用 `addTask(title, description, priority, dueDate)` 重建 | 丢失 `status` / `completedAt` / `createdAt` / `id`，已完成的变回未完成 |
| 3 | `src/pages/SettingsPage.tsx:68` | `bookStore.addBook(title, author, category)` | 丢失 `status` / `progress` / `notes`（读书笔记全丢） |
| 4 | `src/pages/SettingsPage.tsx:72` | `devStore.addProject(name, description)` | 丢失 `status` 与项目下所有 `tasks` |
| 5 | `src/pages/SettingsPage.tsx:75` | `writingStore.addProject(title, type)` | 丢失 `status` / `wordCount` / `notes` |
| 6 | `src/pages/SettingsPage.tsx:78` | 只导入 `fitnessPlans`，**完全没读** `fitnessRecords` | 导出文件里有、导入时被吞掉，训练记录全丢 |
| 7 | `src/pages/SettingsPage.tsx:81` | `gameStore.addGame(name, platform)` | 丢失 `hoursPlayed` / `progress` / `achievements` / `notes` |
| 8 | `src/pages/SettingsPage.tsx:51-92` | **完全没有导入 `dietRecords`** | 饮食记录全丢 |
| 9 | `src/pages/SettingsPage.tsx:51-92` | 无去重、无合并策略、无校验 | 重复导入同一份备份 = 数据翻倍 |
| 10 | 全部 `src/store/*.ts` | `persist` 未设置 `version` / `migrate` | 未来任何类型变更都会导致白屏或数据错乱 |
| 11 | `src/App.tsx` | 无 ErrorBoundary | 单个组件报错整页白屏 |
| 12 | 全仓库 | 零测试、无 ESLint / Prettier 配置 | 违反 AGENTS.md，重构没有安全网 |

**P0 交付要求**：

- 导入改为"**整对象恢复**"：直接写入完整记录（保留 id、状态、时间戳、嵌套数组），不要用 `addXxx(...)` 重建。
- 导入提供三种模式：**合并（按 id 去重）/ 覆盖 / 追加**，写入前给出预览（"将新增 12 条、覆盖 3 条、跳过 5 条重复"）。
- 导入使用 `zod`（或手写 validator）做 schema 校验，字段错误要指出**具体路径与原因**，而不是笼统的"文件格式无效"。
- 补齐完整测试：**导出 → 清空 → 导入 → 数据结构完全一致**的往返测试必须存在并通过。

---

## 5. 设计系统规范

### 5.1 参考设计语言

- **信息密度与键盘效率**：Linear
- **内容层级与留白**：Notion
- **命令面板与快捷操作**：Raycast / Arc
- **数据卡片与圆环进度**：Apple Health
- **日期热力图**：GitHub Contributions / Strava
- **空状态插画与文案**：Stripe Dashboard

### 5.2 颜色令牌（`src/styles/tokens.css` + CSS 变量，亮暗通过 `.dark` 覆盖）

必须从"直接用 `gray-100` / `primary-600`"升级为**语义化令牌**：

```
--bg-canvas      页面底色
--bg-surface     卡片
--bg-elevated    浮层 / Modal / Popover
--bg-inset       输入框 / 内嵌区域
--bg-hover  --bg-active  --bg-selected
--border-subtle  --border-default  --border-strong  --border-focus
--content-primary  --content-secondary  --content-tertiary  --content-disabled
--accent       主色，默认靛蓝 #4C6EF5，可换
--accent-soft  主色浅底
--success  --warning  --danger  --info   （各自带 soft 变体）
```

Tailwind 里映射为 `bg-surface` / `text-content-secondary` / `border-subtle` 这类可读类名。

### 5.3 数值规范（写进 `tailwind.config.js` 的 `extend`）

- **间距**：严格 4px 基数，只用 `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`，禁止 `p-[13px]` 这类随手值。
- **圆角**：`sm 6 / DEFAULT 8 / md 10 / lg 12 / xl 16 / 2xl 20 / full`。卡片统一 12，按钮统一 8（sm 用 6），Modal 16。
- **阴影**：4 档（`xs` 边框级 / `sm` 卡片级 / `md` 悬浮 / `lg` 浮层）；暗色下降阴影强度，改用 `ring-1 ring-white/5` 制造层次。
- **字号**：7 档并配好行高 —— `12/16`、`13/18`、`14/20`、`16/24`、`20/28`、`24/32`、`30/36`；正文 14，卡片标题 16，页面标题 24。
- **字重**：只用 400 / 500 / 600，禁止大面积 700+。
- **对比度**：正文与次要文字均 ≥ 4.5:1（不要用 `text-gray-400` 当正文）。
- **字体栈**：`-apple-system, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Inter, sans-serif`；数字与代码用等宽字体；统计数字开启 `font-variant-numeric: tabular-nums`。
- **动效**：`fast 120ms / base 180ms / slow 260ms`，统一缓动 `cubic-bezier(0.32, 0.72, 0, 1)`；必须响应 `prefers-reduced-motion: reduce`（关闭位移类动效）。

### 5.4 布局骨架

- 侧栏 240px（可折叠为 64px 图标栏），Header 56px，内容区最大宽度 1200px 居中，内边距 24px（<1024px 降到 16px）。
- 侧栏底部放常驻的**用户信息 / 存储占用 / 主题切换**区，不要只有一堆导航项。
- 页面统一结构：`PageHeader`（标题 + 描述 + 右侧主操作）→ `Toolbar`（筛选 / 搜索 / 视图切换）→ 内容区。
- 页面切换加淡入上移 8px、180ms；列表首次渲染 stagger ≤ 30ms，且最多 stagger 前 8 项。
- 骨架屏：所有从 store 读数据的列表首帧用 Skeleton，不要闪空状态。

### 5.5 每个页面必备的 5 种状态

**正常 / 加载（骨架）/ 空（插画 + 说明 + 主 CTA）/ 错误（原因 + 重试）/ 无结果（筛选后，提供"清除筛选"）**。

空状态文案要具体，例如读书页不要写"暂无数据"，而写"还没有书。添加第一本想读的书，开始记录你的阅读进度。"

---

## 6. 组件库补齐清单

现有仅 `Button / Input / Modal / Card / Select`，且全部缺少 `disabled / loading / error / focus-visible` 的完整状态。目标：建成 `src/components/ui` 下一套自用设计系统，**并在 `/ui` 路由提供一个 Kitchen Sink 页面展示所有组件与全部状态**（这条非常重要，方便视觉自查与后续迭代）。

- **基础**：IconButton、Badge、Tag、Chip、Avatar、Divider、Kbd、Tooltip、Spinner、Skeleton
- **表单**：Textarea、NumberInput（含步进）、DatePicker（date-fns 驱动，不引外部 UI 库）、TimePicker、Slider、Switch、Checkbox、RadioGroup、Combobox（可搜索下拉）、FormField（label + 帮助文本 + 错误态）、SegmentedControl、TagInput
- **反馈**：Toast（`useToast()` 全局队列，支持成功/错误/信息/撤销按钮）、Alert、ProgressBar、ProgressRing、ConfirmDialog（统一二次确认，危险操作强制走它）、ErrorState
- **导航与布局**：Tabs、Breadcrumb、PageHeader、Toolbar、Drawer（右侧抽屉做详情编辑）、DropdownMenu、Popover、CommandPalette（Cmd/Ctrl+K）、EmptyState、ScrollArea
- **数据展示**：StatCard（数值 + 环比 + 迷你趋势）、DataTable（排序/筛选/分组，超过 200 行时虚拟化）、Timeline、Heatmap（日历热力图）、Sparkline、BarChart、DonutChart、ListRow、KanbanColumn

**实现约束**：全部支持键盘操作与 `aria-*`；所有交互组件有 `focus-visible` 环；浮层类组件支持 `Esc` 关闭 + 焦点陷阱 + 点击外部关闭；受控/非受控 API 统一；每个组件在 Kitchen Sink 页展示"默认 / hover / focus / disabled / loading / error"六态。

**依赖建议（按需引入，用前说明体积）**：拖拽 `@dnd-kit/core` + `@dnd-kit/sortable`；命令面板 `cmdk` 或自研；虚拟列表 `@tanstack/react-virtual`；校验 `zod`；Toast 自研或 `sonner`；图表优先**手写 SVG**（轻量可控），数据量大再考虑 `recharts`。**不要引入 Ant Design / MUI / Chakra 这类重型 UI 框架**——会与 Tailwind 体系冲突且体积不可接受。

---

## 7. 全局交互与体验规范

1. **命令面板（Cmd/Ctrl+K）**：跳转页面、新建任务/书/项目、触发导出、切换主题、搜索所有实体的标题与笔记内容；输入即搜、方向键选择、`Enter` 执行。
2. **快捷键**：`n` 新建当前模块条目、`/` 聚焦搜索、`Esc` 关闭浮层、`Cmd+S` 保存并提示、`g` 后接数字跳页面（如 `g 2` → 今日计划）。所有快捷键在设置页有说明表。
3. **表单体验**：失焦即校验、提交前全量校验；提交按钮有 loading 且防重复点击；`Enter` 提交、`Shift+Enter` 换行；关闭有未保存内容时二次确认；破坏性操作统一走 `ConfirmDialog`。
4. **乐观更新 + 撤销**：勾选完成、删除等操作立即生效，Toast 提供"撤销"（保留 5 秒）。
5. **拖拽排序**：任务列表、看板列、首页常用卡片都支持拖拽，顺序持久化。
6. **搜索与筛选**：每个模块顶部有搜索框（debounce 200ms，匹配标题 + 备注）与多条件筛选；视图切换（列表/看板/分组）要记住。
7. **空状态与首次使用**：没有任何数据时，提供"一键载入示例数据"按钮（带 `demo` 标记，可一键清除），让界面立刻有内容可看。
8. **无障碍**：语义标签、icon-only 按钮必须有 `aria-label`、Modal 设 `role="dialog"` + `aria-modal`、Tab 顺序合理、对比度达标。
9. **错误处理**：每个路由套 `ErrorBoundary`，提供"重新加载"与"导出数据抢救"两个按钮。
10. **响应式**：≥1280 常规布局；1024–1279 侧栏折叠为图标；<768 侧栏变抽屉 + 顶部汉堡按钮；表格横向滚动而非挤压。

---

## 8. 功能深化：逐模块

> 总原则：**每个模块都要有贴合自身场景的东西，不能都是"一堆卡片 + 一个弹窗表单"。**

### 8.1 首页总览

- 问候语随**时段与当天状态**变化（早/午/晚），配一句当日摘要（如"今天有 3 件事，其中 1 件是紧急的"）。
- 顶部 4 张 StatCard 真正接入数据：待办数、今日完成率、连续打卡天数、本周累计投入。
- 新增**近 7 天 / 30 天活动热力图**（有活动则着色，深浅按量）。
- **今日聚焦**：自动挑出最该做的一条（高优先级 + 逾期 + 今日到期）置顶突出，可一键完成。
- **模块卡片真实化**：现在 6 个卡片只有图标和名字，改成显示真实统计（在读 2 本 / 进行中项目 3 个 / 本周训练 4 次 / 今日 1580 kcal / 在玩 2 款），并支持拖拽自定义顺序。
- 快速备忘升级为"**想法收件箱**"：支持标签、置顶、一键转为任务。
- 新增**快捷添加栏**：解析简单语法，如 `写周报 !高 @今天` → 标题"写周报"、高优先级、今日截止。

### 8.2 今日计划

- 子任务（可折叠，显示进度"2/5"）。
- 重复任务（每天 / 每周指定星期 / 工作日 / 每月），完成后自动生成下一次。
- 截止"日期 + 时间"，**逾期高亮为红色并显示"已逾期 2 天"**。
- 三种视图：**列表**（默认）/ **看板**（待办 / 进行中 / 完成，可拖拽）/ **四象限**（重要-紧急矩阵）。
- 番茄钟：在任务上启动计时，记录专注时段，首页展示"今日专注 X 分钟"。
- 完成动效（微缩放 + 对勾划线）+ Toast 撤销。
- 顶部显示"今日 4/7 已完成"环形进度；底部显示本周完成率柱状图。
- 拖拽排序 + 标签 + 全文搜索 + 按标签/优先级/状态筛选。

### 8.3 读书

- 进度双模式：百分比 / 页码（输入总页数与当前页自动换算），用 Slider 快速拖动。
- 笔记升级：关联页码、支持引用原文、标签；按时间倒序的时间轴展示；可导出为 Markdown。
- **阅读会话**：记录开始/结束时间，累计阅读时长，在首页与统计区展示。
- 年度阅读目标 + 圆环进度；按状态/分类分组的书架视图（想读 / 在读 / 已读，卡片带进度条与封面占位）。
- 书卡显示"读完预计还需 X 天"（按最近阅读速度估算）。
- "未读完超过 30 天"的提醒区。

### 8.4 开发工作

- **项目详情独立成页**（不再是弹窗），路由 `/dev/:id`，含介绍、任务看板、里程碑、活动日志。
- 项目任务看板支持拖拽流转（待办 / 进行中 / 已完成），任务带子项、工时估算与实际工时。
- 项目字段扩展：技术栈标签、仓库地址（可点击链接；离线时优雅降级为纯链接）、状态、起止日期。
- 每日站会记录：今天做了什么 / 计划做什么 / 阻塞项。
- 项目归档 + "停滞超过 14 天"提醒。
- 统计视图：各项目任务完成数、近 30 天活动条。

### 8.5 写作

- 从"填个字数"升级为**轻量编辑器**：左侧大纲/笔记，右侧正文，实时字数、段落数、预计阅读时长。
- 目标字数进度条 + 达标庆祝动效。
- **写作热力图**：每日新增字数（用会话差值计算）。
- 写作会话计时（开始写作 / 结束并记录）。
- 灵感收件箱：随手记卡片，可拖入文稿或转为文稿。
- 版本快照：每次保存留一版，可回看或回滚（保留最近 20 版）。
- 导出 Markdown / 纯文本。

### 8.6 健身

- **动作库**：内置常见动作（按肌群：胸/背/腿/肩/手臂/核心；按器械：杠铃/哑铃/徒手/器械），可自定义。
- **训练模板**：从计划一键生成今日训练记录（直接带出模板动作），记录时只填重量与次数。
- 记录明细表格：每组 `重量 × 次数`，支持"复制上一组"与组间休息计时器。
- **1RM 估算**（Epley 公式）+ 每个动作的**个人最佳 PR**，破纪录时弹庆祝提示。
- 训练容量（组数 × 次数 × 重量）按肌群统计，周/月对比。
- 训练频率日历热力图 + 体重/围度记录折线图。
- 支持"复制上次训练"快速开始。

### 8.7 饮食

- 从"只记热量"升级为**三大营养素**：蛋白质 / 碳水 / 脂肪 + 热量，每餐显示占比。
- **食物库**：常用食物可收藏（含每 100g 营养数据），支持搜索、按分类（主食/蛋白/蔬菜/水果/乳制品/零食/饮品）筛选、最近使用。
- 每日目标：热量 + 蛋白质，圆环进度 + 剩余额度（超目标变红）。
- 按餐次卡片（早餐/午餐/晚餐/加餐），显示每餐小计与全天累计。
- 快速操作：复制昨天、常用搭配一键添加、饮水记录（8 杯打卡）。
- 周/月趋势图：热量与营养素折线 + 达标天数统计。

### 8.8 游戏

- 从列表升级为**游戏库**：分组（在玩 / 已通关 / 搁置）、封面占位（按名称生成渐变色块 + 首字）、平台筛选。
- 时长记录升级为**游玩会话**（开始/结束），累计时长自动统计，可手动修正。
- **成就墙**：成就列表 + 解锁进度环；总解锁数在首页展示。
- 评分（1–10）与短评；通关日期；可选"每小时成本"（填入购买价格后计算）。
- 年度游玩统计：总时长、通关数、最投入的平台。
- 首页显示"本周游玩 X 小时"，超阈值时温和提醒。

### 8.9 数据与设置

- 主题：亮 / 暗 / **跟随系统**；主题色可选 6 种（靛蓝/青/绿/橙/粉/紫）；界面密度（舒适/紧凑）；正文字号（小/中/大）。
- 数据统计总览：各模块条数、存储占用（估算 localStorage 字节数）、最近修改时间。
- 导入导出：**分模块**导出/导入 + 全量导出/导入；导入前预览与冲突策略选择（见第 4 节）。
- **自动备份**：每次数据变更前保留快照，滚动保留最近 10 份，设置页可查看时间点并一键回滚。
- 危险区：分模块重置（如"只清空游戏数据"），每个都走 `ConfirmDialog` 且要求输入确认词。
- 快捷键说明表；关于页（版本、技术栈、数据存储位置说明）。

---

## 9. 数据层加固规范

- **存储 key 统一前缀** `lm:`（如 `lm:tasks` / `lm:books`）。提供一次性迁移：启动时若发现旧 key（`tasks-storage` 等）存在且新 key 不存在，则读取旧数据写入新 key，**保留旧 key 不删除**（安全兜底）。
- 每个 store 的 `persist` 必须配置 `version` + `migrate`，写清每一步迁移逻辑。
- 导出结构固定为：

```json
{
  "app": "life-manager",
  "schemaVersion": 2,
  "exportedAt": "2026-09-28T08:00:00.000Z",
  "data": {
    "tasks": [], "memos": [], "books": [], "devProjects": [],
    "writingProjects": [], "fitnessPlans": [], "fitnessRecords": [],
    "dietRecords": [], "games": [], "settings": {}
  }
}
```

  导入时同时兼容 v1（无 `schemaVersion` 的扁平结构），自动升级。

- **`id` 生成改为 `crypto.randomUUID()`**（现有实现用时间戳 + 随机数，重新导入时可能碰撞）。
- 导入流程：读取 → schema 校验 → 与现有数据比对 → 预览摘要 → 用户确认策略 → 事务式写入（先备份快照，写失败则回滚）→ Toast 结果。
- 存储容量：估算占用超过 4MB 时在设置页警告，并提供"迁移到 IndexedDB"选项（`idb-keyval`，作为可选增强而非默认）。
- store 使用方必须用**选择器订阅**（`useStore(s => s.tasks)`）而非 `useStore()` 全量订阅，配合 `useShallow` 避免无谓渲染。

---

## 10. 工程质量与测试

- `tsconfig` 开启 `noUnusedLocals`、`noUnusedParameters`、`noUncheckedIndexedAccess`；消灭现存 `any`。
- 引入 **ESLint**（`@typescript-eslint`、`eslint-plugin-react-hooks`、`eslint-plugin-jsx-a11y`）+ **Prettier**，`package.json` 增加脚本：`dev / build / preview / test / test:coverage / lint / lint:fix / format / typecheck`。
- 测试基建：**Vitest + @testing-library/react + @testing-library/user-event + jsdom**。必须覆盖：
  - 所有 store 的增删改查与边界（重复 id、空数组、异常输入）；
  - **导入导出往返无损**（导出 → 清空 → 导入 → 深度相等）；
  - 迁移函数（旧数据 → 新结构）；
  - 关键组件交互（表单校验、确认弹窗、筛选逻辑）；
  - 覆盖率目标：`src/store` 与 `src/utils` ≥ 80%。
- 路由级 `React.lazy` + `Suspense` 分包，确保首屏不被图表/编辑器拖累。
- 构建目标：gzip 后首屏 ≤ 300KB；用生产构建核对，并在交付时报告实测数值。
- **每次改动必须 `npm run typecheck && npm run lint && npm run test` 全绿后再提交 Git commit**（AGENTS.md 硬性要求）；commit message 用 Conventional Commits（`feat:` / `fix:` / `refactor:` / `style:` / `test:` / `chore:`）。
- 交付前清理：无 `console.log`、无 TODO 残留、无注释掉的死代码。

---

## 11. 分阶段执行计划

**执行纪律：每阶段开始先输出不超过 10 行的实施计划与文件清单；每阶段结束必须能跑、必须提交 commit。**

- **P0 数据安全与缺陷修复**：第 4 节全部 12 项 + 测试与 lint 基建。产出：无损导入导出 + 测试全绿。**视觉暂不动。**
- **P1 设计系统与组件库**：`tokens.css`、tailwind 主题扩展、第 6 节组件清单、`/ui` Kitchen Sink 页。产出：一个能看全部组件全状态的页面。
- **P2 布局与全局能力**：新 Layout（可折叠侧栏 / 移动抽屉）、PageHeader、Toast、ConfirmDialog、CommandPalette、ErrorBoundary、主题与密度切换、路由分包与骨架屏。
- **P3 页面重构**（逐个提交，建议顺序）：首页 → 今日计划 → 读书 → 开发 → 健身 → 饮食 → 写作 → 游戏 → 设置。
- **P4 统计与可视化**：热力图、Sparkline、环形进度、趋势图（手写 SVG 优先）。
- **P5 打磨**：动效细节、空状态插画与文案、无障碍检查（对比度/键盘/aria）、性能（虚拟化、memo、bundle 分析）、响应式降级。

---

## 12. 验收清单（DoD）

**视觉**

- [ ] 全站间距只用 4px 基数档位；圆角、阴影、字号均来自设计令牌，无写死值
- [ ] 暗色主题下所有文字对比度 ≥ 4.5:1，无"灰色糊在一起"的区域
- [ ] 所有可交互元素具备 default / hover / active / focus-visible / disabled 五态
- [ ] 无浏览器默认控件样式残留（原生 `select`/`date` 等不可避免处也需统一尺寸与配色）
- [ ] 页面标题、区域标题、正文、辅助文字层级分明，字号混用不超过 4 档

**交互**

- [ ] 所有危险操作有二次确认；所有删除/完成操作可撤销
- [ ] 所有异步操作有 loading；所有列表有空状态；所有失败有明确原因与重试入口
- [ ] Cmd+K 可用；`Esc` 可关闭任意浮层；表单 `Enter` 提交
- [ ] 键盘可完成"新建 → 填写 → 保存"全流程，无鼠标依赖

**数据**

- [ ] 导出 → 清空 → 导入后，数据与导出前**完全一致**（有测试证明）
- [ ] 旧 key 数据可自动迁移，用户数据零丢失
- [ ] 清除数据只影响 `lm:` 前缀 key
- [ ] 重复导入不产生重复条目

**工程**

- [ ] `npm run typecheck && npm run lint && npm run test` 全绿
- [ ] 运行期无 console 错误/警告
- [ ] 首屏 gzip ≤ 300KB，已报告实测值
- [ ] 每个阶段都有对应 Git commit

---

## 13. 交付与沟通要求

每次交付请按此格式回报，不要只说"已完成"：

1. **改动概览**：一句话说明这轮做了什么。
2. **文件清单**：新增 / 修改 / 删除的文件路径。
3. **验证方式**：执行的命令 + 实际输出；以及"打开 http://localhost:5173 后的自查步骤"（点哪里、应看到什么）。
4. **假设与取舍**：需求模糊处你做了什么选择、为什么。
5. **未完成 / 遗留**：明确列出，并说明原因与建议下一步。

遇到需求冲突时，按此优先级决策：**数据安全 > 现有功能不退化 > 交互清晰 > 视觉美观 > 性能微优化**。

---

## 附录 A：极简版（一行提示词）

> 读 `E:\MyApp` 源码与其 `docs/`、`AGENTS.md`，把这款本地个人管理应用全面升级：先修数据缺陷（`SettingsPage` 的 `localStorage.clear()` 与 7 处导入丢字段问题），再建立 Tailwind 设计令牌与组件库（含 Toast / ConfirmDialog / CommandPalette / 表格 / 图表 / 热力图 / Kitchen Sink 页），然后逐模块深化功能与视觉（任务看板与子任务、阅读会话与笔记时间轴、写作编辑器与字数热力图、训练 PR 与容量统计、三大营养素与食物库、成就墙与游玩会话），最后补 Vitest 测试与 ESLint/Prettier。保持**默认**纯本地（同步可选，见 `docs/adr/0002`）、数据零丢失，分阶段提交，每阶段给验收步骤。

## 附录 B：单模块迭代模板

> 上下文：`E:\MyApp` 是个人本地管理应用（Vite + React 18 + TS + Tailwind + zustand persist + react-router）。遵守第 5/6/7 节的《设计系统 / 组件库 / 交互规范》（此处粘贴第 5–7 节）。现在只优化 **<模块名>**（`src/pages/XxxPage.tsx` + `src/store/xxxStore.ts`）：<粘贴第 8 节对应小节>。要求：不改动其他模块与既有 localStorage 结构（如需变更必须写 migrate）；完成后跑 `typecheck / lint / test`；给出手动自测步骤；提交一个 commit。

## 附录 C：复核提示词（让另一个 Agent 挑刺）

> 对 `E:\MyApp` 的最近一次改动做严格复核，重点找：(1) 是否破坏既有 localStorage 数据或缺少 migrate；(2) 是否有 `any`、未处理空值、潜在运行时崩溃；(3) 是否违反设计令牌（写死颜色/间距/字号）；(4) 暗色主题下是否有对比度或层级问题；(5) 键盘可达性与 aria 是否缺失；(6) 是否有未处理的错误/加载/空状态；(7) 测试是否真正覆盖导入导出往返与迁移路径。按严重度 P0/P1/P2 列出问题，每条给出文件路径、行号、复现方式与修复建议，不要泛泛而谈。
