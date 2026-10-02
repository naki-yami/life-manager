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

- **本仓库用本地 markdown 跟踪器**（见 `issue-tracker.md`），所以「标签」不是 GitHub 上的 label，
  而是**工单文件顶部的 `Status:` 行**，取值就是上表的左侧一列：
  `Status: needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。
- 标签字符串逐字等于角色名，无需改动。若将来改用别的词汇（例如用 `bug-triage` 代替
  `needs-triage`），**只改右侧一列**，并保证 `Status:` 行写的是同一套字符串。
- 若将来给 PAT 补上 Issues 写权限、改回 GitHub Issues 跟踪，需要先在仓库里建出这四个标签
  （实测目前只存在 `wontfix` 一个）。
