# 工单与规格用本地 markdown，不用 GitHub Issues

V1 期间这个仓库没有任何 issue —— 工作靠 `docs/Life-Manager-V2-优化建议.md` 里的分阶段进度表推进。
接入 `to-spec` / `triage` / `to-tickets` 这套技能时需要一个真正的跟踪器，而技能的默认预期是 GitHub Issues。

我们决定**用本地 markdown**：工单与规格放在 `.scratch/<feature-slug>/`，spec 是其中的 `spec.md`，
实现工单是 `issues/<NN>-<slug>.md`，triage 状态写成文件顶部的 `Status:` 行。**`.scratch/` 进版本控制**
（与 `.workbuddy/` 相反，后者是工作记忆、不随仓库走）。

## 考虑过的其他做法

- **GitHub Issues**（技能的默认预期）：本来是最顺的选择，仓库也启用了 Issues。**但当前 PAT 只有
  Issues 的读权限** —— 读得到（GraphQL `issues { totalCount }` 正常返回 `0`），写不了
  （`createIssue` 报 `Resource not accessible by personal access token`，`gh label create` 返回 403）。
  这不是临时故障，是 token 的权限配置，改它需要去 GitHub 后台。为一个跟踪器去要写权限，
  对单人项目不划算。
- **`.scratch/` 但不进版本控制**（照 `.workbuddy/` 的先例）：会让规格与工单丢失历史，
  与本仓库「每次改动都创建一个 commit」的规矩冲突 —— 工单本身就是决策记录。
- **继续用 V2 文档里的进度表**：那张表是**阶段**视角，不是**工单**视角，而且已经被证明会过期
  （README 曾从它的过期行里抄出一份 6 项里 4 项已完成的假清单，见提交 `ca4e2f3`）。
  工单需要独立的、一次只写一件事的载体。

## 后果

- 路径与文件名**用英文小写连字符 slug**（如 `fitness-diet-tag-editor`），正文用中文。理由：
  中文与全角标点在脚本、shell 与工具链里容易被转义搞坏（`docs/adr/` 下两个 ADR 的中文文件名
  是历史遗留，不再增加）。`docs/agents/issue-tracker.md` 里记了这条约定。
- 「打标签」不再是调 `gh issue edit --add-label`，而是**改文件顶部的 `Status:` 行**；
  `docs/agents/triage-labels.md` 里记了角色名到 `Status:` 取值的对应。
- **将来若给 PAT 补上 Issues 写权限，可以改回 GitHub Issues** —— 那时要把本文件的状态改为
  `superseded by`，并先在仓库里建出 `needs-triage` / `needs-info` / `ready-for-agent` /
  `ready-for-human` 四个标签（实测目前只有 `wontfix` 存在）。
- 技能若假定 GitHub（例如 `wayfinder` 用 GitHub 原生的 sub-issue 与依赖边），一律回退到
  本地约定的等价物：`Part of` 行表示归属，`Blocked by: NN` 行表示阻塞。
