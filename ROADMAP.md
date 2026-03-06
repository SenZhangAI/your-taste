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

---

## Later: Expand

- **Cross-platform support** — Cursor, Codex, Copilot adapters
- **Team reasoning profiles** — Composite frameworks from team correction patterns

---

## Contributing

See [README.md](README.md) for setup. Open issues describing the user problem, not just the solution.
