# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

**本仓库是单上下文**：根目录一个 `CONTEXT.md` + `docs/adr/`，没有 `CONTEXT-MAP.md`。

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-导航收敛与嵌套路由.md
│   ├── 0002-跨设备同步以本机服务实现，纯本地降为默认.md
│   └── 0003-工单与规格用本地-markdown.md
└── src/
```

（下面是多上下文仓库的形状，仅作对照；本仓库不使用。）

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

`CONTEXT.md` 是中文词表，分区为：导航 / 数据 / 同步 / 外观 / 开发工作。写 issue、测试名与提交信息时
沿用其中的说法（例如「宿主」「子页」「数据模块」「条目」「打卡」「墓碑」），不要另造同义词。

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

特别注意 **ADR-0002**：它把「纯本地」从硬约束降为默认形态，并解除了 V1 的「不引入后端与云 API」约束。
`docs/Life-Manager-V2-优化建议.md` §6 / §8 里那两条 V1 硬约束**已被 ADR-0002 取代**，属于历史记录；
若你的方案与它们冲突，以 ADR-0002 为准，并在输出里说明。
