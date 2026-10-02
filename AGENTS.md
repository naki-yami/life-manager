# AGENTS.md

## 注意事项

1. 每次改动完成后，都必须创建一个对应的 Git commit，以便后续追踪和回滚。
2. 每次改动后，都必须编写和更新相关测试，并在交付给用户前，确保所有验证和测试全部通过。

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `naki-yami/life-manager` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
