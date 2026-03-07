# Roadmap

See [MILESTONE.md](MILESTONE.md) for completed milestones and known issues.

## Current: v1.1 — Publication Ready

**Goal:** Make your-taste installable and usable by anyone with a Claude Code subscription.

### P0 — Blockers for public release

- [ ] **Dogfood the incremental loop** — Run SessionEnd hook across 10+ real sessions, verify signals accumulate and framework evolves correctly. This is the core value loop; it must work before anyone else tries it.
- [ ] **Graceful error handling** — Init scan failure (fetch failed mid-scan) must recover and report partial results, not crash. All error messages must tell the user what to do next.
- [ ] **LLM provider story** — Verify the env-var auto-detection path works for users without custom proxy setups. Document the simplest path (set ANTHROPIC_API_KEY, done). Remove claude-cli-proxy as implicit dependency.

### P1 — Quality of life

- [ ] **Init resilience** — Resume interrupted scans, skip failed sessions, report progress clearly
- [ ] **Hook output clarity** — User-visible hook messages should confirm what happened ("Analyzed session, found 2 new reasoning gaps")
- [ ] **First-run experience** — After `taste insights`, guide user to `taste show` and explain what happens next (automatic via SessionEnd)

### P2 — Polish

- [ ] **Better A-to-C inference** — Improve extraction of missing reasoning steps vs surface preferences
- [ ] **Evidence decay** — Reduce weight of old evidence, strengthen recent patterns
- [ ] **Framework quality metrics** — Measure whether injected checkpoints actually prevent repeat mistakes

### P3 — Pattern routing to project CLAUDE.md

**背景**: thinking-context.md 每次 turn 注入，只适合普遍适用的抽象规则。但 synthesize 过程中会 skip 一些 task-specific 的 pattern（如"PATCH endpoint 字段可编辑性检查"），这些 pattern 对特定项目仍有价值。

**设计方向**:
- Skip 的 pattern 记录在 `observations-skip-decisions.md`（已实现）
- 新增 review 流程：在项目目录下运行时，AI 可读代码做中间层泛化
  - 原始 skip: "orders.total_cents 是下单快照"
  - 泛化后写入项目 CLAUDE.md: "本项目金额字段是下单时快照，不应随源数据变化同步更新"
- 用户通过交互式 review 决定是否放入当前项目 CLAUDE.md
- **泛化发生在 review 阶段**（有项目 context），而非 synthesize 阶段（无项目 context）
- 项目 CLAUDE.md 的规则应是**中间层抽象**：不重复 thinking-context 的通用原则，但也不具体到单个表/字段，而是覆盖项目内同类实体

---

## Later: Expand

- **Cross-platform support** — Cursor, Codex, Copilot adapters
- **Team reasoning profiles** — Composite frameworks from team correction patterns

---

## Contributing

See [README.md](README.md) for setup. Open issues describing the user problem, not just the solution.
