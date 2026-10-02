# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`. **`.scratch/` 进版本控制**
（与 `.workbuddy/` 相反：`.workbuddy/` 是工作记忆，`.scratch/` 是随仓库走的工单与规格）。

GitHub Issues **不使用**：本仓库的 fine-grained PAT 只有 Issues 的读权限，创建 issue 与标签都会被
拒绝（`createIssue` GraphQL 报错、`gh label create` 返回 403）。因此所有工单一律落本地 markdown。
决策与代价见 `docs/adr/0003-工单与规格用本地-markdown.md`。

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## 本仓库约定

- **slug 用英文小写连字符**（例如 `fitness-diet-tag-editor`），文件名避免中文与全角标点 ——
  路径里带中文或全角逗号在工具链、脚本与 shell 里容易出问题（`docs/adr/` 下的 ADR 文件名
  是历史遗留，不要再增加）。
- **正文用中文写**，术语沿用 `CONTEXT.md` 词表（「宿主」「子页」「数据模块」「条目」「打卡」「墓碑」…）。
- spec 顶上写一行 `Status:`，取值见 `triage-labels.md`。

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
