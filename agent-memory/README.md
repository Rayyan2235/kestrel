# Shared agent memory

Operational memory for every coding agent on Kestrel (Claude Code, Codex, teammates). Read this folder before you touch code, and update it before you finish.

## Reading order

1. `01-overview.md`: what Kestrel is, scope, differentiators, ground rules.
2. `02-runbook.md`: how to install, run, test and debug on this machine.
3. `03-codebase-map.md`: where things live and the invariants the code enforces.
4. `04-status.md`: what works, what is stubbed, known issues, last verified results.
5. `05-decisions.md`: settled choices vs open questions, with pointers to planning notes.
6. `06-handoff.md`: the current task, next steps and anything in flight.
7. `07-changelog.md`: dated, append-only log of what each session changed.
8. `08-current-scope.md`: **read this first if you are continuing the teammate prototype.** It covers Pythagoras squares plus voice, and what is and isn't in scope.
9. `09-pythagoras-gamification.md`: the puzzle mechanic, levels and bot roles.
10. `10-voice-agent-design.md`: STT → LLM → tasks → policies → TTS, with the providers.

## Source-of-truth order

1. The owner's explicit instructions in the current conversation.
2. Planning notes in `context/HackPSU-2026/`. This is a local, gitignored copy of the private Obsidian project. Start with `_context.md` and `build-order.md`. The live original is the teammate's private Obsidian vault; its path is in the gitignored `CLAUDE.local.md`. If the two differ, the original wins; re-copy it.
3. Repo snapshots: `AGENTS.md`, `README.md` (implemented capabilities), `PRODUCT.md`, `DESIGN.md`, `docs/`.
4. This folder. It summarizes and records; it never overrides 1–3.

## Update protocol (mandatory)

After any change, update, development work or verification run:

- Append an entry to `07-changelog.md`: date, agent, what changed, files touched, checks run and their results.
- Edit `04-status.md` if capability, test results or known issues changed.
- Rewrite `06-handoff.md` so the next agent can continue cold: current goal, what is done, what is next, what is blocked.
- Edit `02-runbook.md` if any command, port, env var or setup step changed.
- Edit `03-codebase-map.md` if you added, moved or removed modules or invariants.
- Edit `05-decisions.md` only when the owner settles or reopens something. Never record your own recommendation as a decision.

Keep entries short and factual. Report failures as failures, with output.

## Privacy

This folder sits in a **public** GitHub repo (`usmannsiddiqui/kestrel`). Write only public-safe material here: no API keys, no copied vault text, no learner data, and no personal paths beyond what is needed to run things. Refer to planning notes by filename instead of quoting them. `context/` is gitignored and must stay that way.
