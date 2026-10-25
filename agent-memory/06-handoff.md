# Current handoff — branching Robot Rescue

Branch rescue-navigation, local/uncommitted. Do not push or merge main. Preserve the current playground design.

Owner rejected the single-corridor zigzag. Course now matches their branching A/B/C/D/E/F/H diagram, with one-way arrows giving exactly four paths. A start, H charger. Routes: ABEH 3.096 m; ACDEH 4.970 m; ABDEH 5.320 m; ACFDEH 5.959 m. Actual-distance battery is 4.2 m, with gait allowance for shortest only. Follow marked links; no off-road shortcut or automatic graph solving.

Shared RESCUE_EDGES drives the floor links/arrows, SVG distance map and adjacency validation. Internal letter routes include A and H and every intervening junction. Players can omit A because Pip starts there; start/charger aliases accepted. Invalid connections, backwards links, repeated letters and negations are refused. No requirement to visit all checkpoints. Supply islands clear all four paths with robot clearance.

Type a route button and microphone remain. Physics owns movement and battery. Death bubble precedes reset; success requires actual charger arrival. Reset generation cancels stale transcripts. User should test their real microphone/STT; automated browser capture/transcription is mocked, physics is real.

Plan: docs/superpowers/plans/2026-10-25-rescue-navigation.md. Tests: contracts graph enumeration/parser/schema, simulation all three losing routes and successful shortest, browser desktop voice/death/reset/success and mobile entry. See changelog for final run results.

Local .agents/, .claude/, skills-lock.json stay outside commits.


2026-10-25: Created four preview-only duck material colorways in docs/previews/duck-colorways using actual rigs and simplified playground-colored stage. Production materials unchanged. Await user selection before applying. See README for exact colors and mapping scope.


2026-10-25: Owner selected dark grey and navy. Applied Pip #454B54 and Nova #244267 to sandbox shell/foot accents, with neutral #E4E6E5 panels; crew dots match. Existing non-tinted rig materials remain unchanged. Typecheck passed. Selected material render in docs/previews/duck-colorways/selected. Still rescue-navigation, no main push.


2026-10-25: Added white lower-head trim (jaw/bottom head shell) to the selected charcoal/navy rigs. Increased NAV cruise .55→.65, approach .30→.35, spin 3→3.6, near spin 1.8→2.1. New scripts/bench/speed-bench.mjs compares six real MuJoCo/ONNX runs per preset: baseline 6/6, mean 5.2 s, 2.5 cm error, 0 falls; faster 6/6, mean 4.2 s, 2.4 cm error, 0 falls. Manual forward now .65, reverse -.4 (outside dead zone), pivot 3.6; moving turns use .35 forward and 1.2 yaw. Physics timestep and simulation clock unchanged. Final rescue/check results recorded below.
