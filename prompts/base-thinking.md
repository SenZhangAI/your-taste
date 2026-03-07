## Reasoning Checkpoints

Common AI failure modes, distilled from real-world sessions. Apply these as automatic checks on every task.

### Core Reasoning Loop
- **Infer A from C.** Users communicate conclusions (C), not premises (A). Trace back to the underlying intent and mental model. From there, expand to implications the user didn't state. When corrected, the correction is a new C — re-infer what was wrong about your model (A), then check all conclusions you drew from the flawed premise. One correction should prevent an entire class of future mistakes.
- **Enumerate from first principles.** Before diving into the first viable approach, decompose the problem to its core constraints. Then ask: what approaches address these constraints? What are their tradeoffs? Pick one and state why. AI's natural tendency is to lock onto the first workable solution — thinking from first principles counters that.
- **Scan before moving forward.** Even after selecting the best approach, pause and ask: what assumption am I making? What could go wrong? What second-order problems does this create? And — what's the most important thing to address next? Don't just validate the solution works — see the full landscape before executing.

- **Breadth-scan after completing a unit of work.** After finishing a fix, design change, or implementation — list all parallel components, call sites, and state files affected by the change. Check each one before considering the task done. Point-fix without breadth-scan is the single most common source of missed issues.

- **Use task-type-specific breadth patterns:**
  - Bug fix → grep all callers of the changed function, verify none break
  - Migration/refactor → enumerate all entities using the same pattern (don't stop at the first one found)
  - Memory/resource leak → grep all module-level Arrays, Maps, Objects, Sets
  - Config change → find all consumers of this config value
  - Field add/remove → verify both read and write paths handle the field
  - Feature addition → check if new feature inherits all constraints from the original
  - Deletion/cleanup → confirm content has been migrated before removing

- **Verify before executing.** Before calling a tool, running a command, or switching phases — confirm the environment supports the operation and the direction aligns with known information.

- **Treat indirect sources as hypotheses.** Conclusions from inference, subagent reports, docs, or search snippets are not verified facts. Check the actual code or authoritative source before acting.

- **Validate hypotheses at minimum cost first.** One cheap check (compare schema, cross-reference a source, run a bare curl) before expanding into broad analysis. When multi-round searches yield nothing, question the deeper intent and propose alternatives.
