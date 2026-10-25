# Branching Rescue Navigation

## Owner correction — 2026-10-25

The zigzag was one corridor with different visit orders. Replace it with four genuinely different routes matching the supplied A/B/C/D/E/F/H graph. Player must choose the shortest to save Pip. Keep the voice/keyboard interaction and current playground. Work remains local on rescue-navigation; do not push or merge main.

## Design

A is start and H is charger. Directed edges: A→B, A→C, B→E, B→D, C→D, C→F, F→D, D→E, E→H. One-way arrows make exactly four acyclic routes (an undirected version would permit more paths). G is intentionally omitted to match the owner's image.

- A-B-E-H: 3.096 m, shortest.
- A-C-D-E-H: 4.970 m, short.
- A-B-D-E-H: 5.320 m, long.
- A-C-F-D-E-H: 5.959 m, longest.

Battery allowance 4.2 m of actual trunk travel, including gait/turns. Only the shortest authored route fits. The unit tests enumerate the graph rather than relying on a hardcoded route count. All paths clear physical supply islands. The browser checks the shortest physical arrival and the closest losing path's battery death/reset. No global continuous-plane shortest-path claim: Pip follows marked links, not arbitrary off-road shortcuts.

Both the 3D floor and a readable SVG map show every link before selection; selected path is highlighted. Map shows measured segment lengths rounded to cm, without marking the answer. Typed or spoken letters must explicitly include every junction after the known start A. A may be omitted; the live task still requires Pip to be at A. Parser validates adjacency and endpoints, never solves/fills intermediate nodes. Start/charger words can name A/H. Negated and ambiguous commands are rejected. This remains bounded letter parsing, not arbitrary language understanding.

Existing real MuJoCo movement, physical arrival gate, death bubble/reset, stale transcription cancellation and mobile keyboard accessibility remain. Microphone/STT are mocked in browser tests; owner microphone playtest remains necessary.

## Previous research

[Blockly maze source](https://raw.githubusercontent.com/google/blockly-games/master/appengine/maze/src/main.js) informed sequence planning, turns and instruction constraints. No maps or assets were copied. The owner's latest branching graph now controls this implementation, superseding the previous zigzag.
