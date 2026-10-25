# Handoff — product entry integration, 2026-10-25

## Current task

Owner explicitly requested merging the landing page and actual console to main after removing the old scripted view and adding a dark purple glass tint. Changes are on `glass-windows`, PR #8. The original `welcome-preview` worktree is preserved; only its landing components/assets were copied, avoiding its older simulation ancestors.

## Delivered

- `/` is the illustrated landing page; all Open console links lead to `/console`, the real MuJoCo/ONNX SandboxApp. Home returns to `/`. `/lab` and `/sandbox.html` remain usable.
- Old App screen, preview scene and preview store removed with obsolete tests. Separate `?demo=two-bot` teammate demo preserved, lazily loaded.
- Console runs outside StrictMode to initialize WASM once; landing does not load physics. Purple glass tint and existing pill controls use the owner palette.
- Landing FAQ describes current AI/voice honestly, including server configuration and current single robot. Other two-robot physics branches are not included in this UI integration.
- README, design, provenance and codebase map updated. Local installed design skill remains untracked.

## Verification

- `pnpm check`: passed, 139 tests, types, web/API builds and API smoke. Eight obsolete preview-store tests were removed with the store.
- Landing/navigation/real-console Playwright: 16/16 desktop/mobile, including actual movement at `/console` and Stop/Reset at `/sandbox.html`, with mocked AI.
- Production screenshots inspected at desktop and phone sizes: no page errors or horizontal overflow; purple glass and Open console/Home navigation confirmed.
- Code review caught a stale root-page integration assertion; corrected to the landing contract. Follow-up integration checks and GitHub CI gate the requested merge.

## Next

Finish integration/CI checks, merge PR #8 using a merge commit as authorized, and verify origin/main includes it. Teammates pull main, install frozen dependencies, and run pnpm dev; each supplies their own .env for live AI/voice. Do not merge unrelated simulation PRs.

Integration follow-up: 8/8 desktop/mobile checks passed, including actual `/console` physics boot without automatic external/provider calls and the preserved teammate demo. Combined relevant browser checks: 24/24.
