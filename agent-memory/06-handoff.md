# Current handoff — fix-contact-leak

PRs #21 (rescue + console windows), #22 (landing redesign) and #23 (Tiger Data progress) are merged into `main`.

Branch `fix-contact-leak` (from `main`): frees MuJoCo's `data.contact` copy in `DuckSim.audit()`, which leaked ~2 MB/s of wasm memory until the tab aborted at the 2 GB cap. See `07-changelog.md`.

Rule for MuJoCo bindings: any value with a `.delete()` method (an embind object returned by value) must be freed by JS; typed-array views such as `data.xpos` need nothing.
