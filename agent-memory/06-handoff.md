# Current handoff — rescue-main

Branch `rescue-main` (worktree `kestrel-crew-windows`). The owner chose the rescue-navigation code as the new main: it keeps rescue's tree, and `main` is recorded as merged with `-s ours`, so none of #11–#17 is in it except what was re-added below.

Done on this branch:
- Robots answer with a short robot sound (`/audio/bd1-reply.mp3`, owner-supplied) instead of ElevenLabs speech; their words stay in the think bubble and log. The system prompt asks for one short sentence.
- `normalizeTask` folds a stray `direction` into the sign and drops extra fields, so a `move` with `direction: "forward"` no longer fails the strict schema (this was why Pip ignored commands on main).
- Objectives board with XP: Balance the beam loads Moments and releases the plank so it tips left; the bar fills only when the released plank reads level for 1 s with no robot working. Build the triangle and Rescue Pip reuse the slot and charger measurements.
- Collapsible You and Pip / Pip and Nova windows. Pip and Nova shows the simulator's real crew handoffs (set_balance, build_squares, Nova's weight) and each robot's measured result. It is not a second language model.

- Polish: a Controls pill, "Your Kestrel", no provider note, a mute icon, confetti on wins, and pixel-art think bubbles.
- Free play fight: Pip and Nova charge in rounds. A fast clash means an explosion plus a random loser knocked over by `DuckSim.knock` (scripted, not crash physics).

Not ported (owner said it did not work): main's coordinator, the two-bot LLM conversation, and the progress store and levels.

PR #21 (`rescue-main` to `main`) is open. The owner said not to merge yet. Re-run CI after each push; merge only on the owner's word.
