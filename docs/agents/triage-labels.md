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

## 备注

- 五个标签里目前只有 `wontfix` 已在 GitHub 仓库中存在（`gh label list` 核实于 2026-10-02）；
  其余四个会在首次使用时由 `/triage` 自动创建。
- 标签字符串逐字等于角色名，右侧一列无需改动。若将来改用别的词汇（例如 `bug:triage` 代替
  `needs-triage`），**只改右侧一列**，让 `/triage` 去套用已有标签而不是新建重复的。
