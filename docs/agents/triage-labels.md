# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## `ready-for-agent` 的硬门（2026-10-02 定）

标 `ready-for-agent` 之前，要把这份 spec / 工单**逐条核过**，不是通读一遍觉得齐了。四件事：

1. **每个 `file:line` 引用都打开核一遍**：文件在不在、行号对不对、引的是不是它说的那个东西
   （符号真的 export 了吗？行号在后续提交里漂了吗？自引的 `:50` / `:154` 这种最容易烂，
   直接写小节名）。
2. **每条验收断言都问一句「这条可能是恒真的吗」**：在任何实现下都成立的断言等于没测，
   必须换成能失败的写法。恒真断言是「没核过」的典型产物。
3. **每个事实性数字当场数一遍**：版本号、模块数、store 数、测试基线。
4. **分清「依赖」与「阻塞」**：等另一个工单完成是依赖，不影响本 spec 的 `ready-for-agent`；
   只有「本 spec 里还有没定的决定」才是阻塞，才降 `needs-info`。

核不完的，标 `needs-info` 并把还差哪几条列在文件顶上 —— 宁可不标，也别让标签说出内容撑不住的话。

## 备注

- **本仓库用本地 markdown 跟踪器**（见 `issue-tracker.md`），所以「标签」不是 GitHub 上的 label，
  而是**工单文件顶部的 `Status:` 行**，取值就是上表的左侧一列：
  `Status: needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。
- 标签字符串逐字等于角色名，无需改动。若将来改用别的词汇（例如用 `bug-triage` 代替
  `needs-triage`），**只改右侧一列**，并保证 `Status:` 行写的是同一套字符串。
- 若将来给 PAT 补上 Issues 写权限、改回 GitHub Issues 跟踪，需要先在仓库里建出这四个标签
  （实测目前只存在 `wontfix` 一个）。
