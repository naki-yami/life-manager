# Life Manager

纯本地运行的个人生活与工作管理应用。任务、读书、写作、开发、健身、饮食、游戏、习惯、目标、
日记与复盘各自成模块，数据全部存在浏览器里，不联网也不上云。

这份表只收本项目特有的词。通用编程概念不进这里。

## 导航

**导航模块（nav module）**：
主导航里的一项，可以是宿主，也可以是普通页面（如「今日计划」）。
_Avoid_: 只说「模块」—— 备份与导出里的「模块」是另一个意思，见「数据模块」。

**宿主（host）**：
带子页的导航模块。它本身不放业务内容，只提供子页签条与子路由的挂载点，例如 书房 `/study`、健康 `/health`。
_Avoid_: 父页、分组页、容器页。

**子页（sub-page）**：
宿主下面真正干活的页面，例如 读书 `/study/books`、写作 `/study/writing`、健身 `/health/fitness`。
_Avoid_: 子模块、二级页、下级页。

**子页签条（module tabs）**：
宿主顶部那排子页切换控件（`ModuleTabs`）。当前项由 URL 推导，不入库。
_Avoid_: 分页签、标签栏、Tab 栏。

**导航项（nav item）**：
`NAV_ITEMS` 里的一条，含 `path` / `label` / `keywords` / `group`。
_Avoid_: 用它指列表里的业务记录 —— 那是「条目」。

**主导航组 / system 组**：
`NAV_ITEMS` 的两个分组。`main` 进侧栏、底部 Tab、命令面板与 `g+数字`；`system` 只在侧栏。

## 数据

**数据模块（data module）**：
备份与导出里的一个数据集合，对应一个 store 分片（`books`、`writingProjects`…）。
代码里的 `BACKUP_MODULES` / `MODULE_LABELS` 指的是这个。
_Avoid_: 与「导航模块」混用。

**自动快照（auto snapshot）**：
应用自己在 IndexedDB 里留的整库副本，可一键回滚；每天首次打开留一份，空库不占位。
_Avoid_: 备份 —— 备份是导出到文件的。

**备份（backup）**：
导出成 JSON 文件的那份整库数据。可以手动下载，也可以授权一个文件夹后让它静默写入。
_Avoid_: 快照。

**条目（entry）**：
列表里可单独编辑的一条业务记录，例如饮食条目、媒体条目。
_Avoid_: 用它指导航项。

**打卡（check-in）**：
把习惯的某一天标记为完成。取消打卡即删掉那天的记录，不留 0 占位。

**指标（metric）**：
可被设为目标的数据口径，例如训练次数、阅读分钟数。由 `utils/metrics.ts` 按唯一口径现算。

**目标（goal）**：
给某个指标定一个周期与数字。达成率从各模块记录里现算，不单独存。

**达成率（progress）**：
目标当前进度除以目标值。只有指标与目标都存在时才有意义。

## 外观

**皮肤（appearance）**：
整层界面观感，挂 `<html data-appearance>` 切换。`glass`「流光玻璃」是默认（半透明表面、
环境光晕、粘性浮层磨砂，不挂属性走基线令牌）；`paper`「纸面扁平」是素底平卡片，
可在设置页切回。皮肤只换表面观感，不碰业务数据，随备份导出。
_Avoid_: 主题 —— 主题指明暗（themeMode）或主题色（accent），与皮肤是三个维度。

**环境光晕（canvas glow）**：
`--lm-canvas-glow` 定义、`body::before` 渲染的一层固定视口渐变，跟着主题色走。
透明度压在 5% 以内，保证光晕最浓处正文对比度过 AA。

**磨砂（frosted）**：
`.frosted` 工具类，只给真正浮在内容之上的层用（页头、弹窗、抽屉、项目栏）；
卡片不挂，避免全站 backdrop-filter 的性能税。

**级联进场（stagger enter）**：
`.stagger-enter` 给容器直接子元素做逐项 45ms 延迟的淡入上浮，封顶 10 项。
用于仪表盘之外的少量块级进场；长列表不用。

## 开发工作

**项目栏（project rail）**：
开发页左侧的项目切换器（`components/dev/ProjectRail`）。宽屏 sticky 竖列，窄屏横向胶囊条；
选中项写进 URL 的 `?project=`。
_Avoid_: 侧栏 —— 那是全站导航的 Sidebar。

**详情（detail）**：
项目栏右侧的常驻分区：详情头（ProjectHero，编辑就地展开）、里程碑磁贴、工作项、开发日志、
按项目的近期投入。旧路由 `/dev/:id` 永久重定向到 `/dev?project=`。

**推送今日计划（push to today）**：
把一条工作项推进 TasksPage，带 `TaskRef` 回链与幂等去重（`services/devPush`）；
推送任务完成后允许再次推送。
_Avoid_: 同步、导入 —— 数据不搬家，今日计划里只有一条带引用的任务。
