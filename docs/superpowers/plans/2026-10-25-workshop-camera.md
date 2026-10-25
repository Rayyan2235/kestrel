# Workshop and Camera Implementation Plan

**Goal:** Implement the owner-approved Folio-inspired workshop and camera direction from this conversation.
**Architecture:** Keep MuJoCo and fixed screen-relative direction vectors unchanged. Separate camera control from bubble projection. Add procedural visual dressing without introducing obstacles in the walkable floor.
**Tech Stack:** Existing React, R3F, Three.js and CSS; no new dependencies.

## Constraints and review focus
- Nox Noir #141414, Royal Amethyst #7E49B3, Steel Mist #CFCFCF.
- Both robots remain physics-driven. Existing furniture dimensions and experiment geometry stay authoritative.
- Manual pan/zoom must persist, wheel must not scroll the document, and touch cancellation must release gestures.
- Preserve fixed camera orientation so spoken screen-relative directions remain correct.
- Small viewports must retain useful framing and reachable controls. Reduced motion disables decorative animation.

## Tasks
- [x] Extract camera math and test clamping, screen-relative pan, and viewport-dependent framing.
- [x] Add follow/explore/experiment camera rig, pointer/pinch/wheel interaction, accessible controls, and independent bubble projection.
- [x] Build workshop shell, cabinetry detailing, floor docks, lesson markers, reveal and peripheral fan animation.
- [x] Run pnpm check, verify desktop/mobile browser behavior and screenshots, review changes, update shared agent memory.

## Implementation decisions
- Work on lab-workshop-camera from main in the existing checkout, following the owner's branch preference.
- Retain orthographic orientation; do not add orbit because robot direction semantics depend on it.
- Dock markings are flush graphics, not functional charging or physical platforms.
- Use a brief expanding floor ring for the lesson reveal, without hiding the physical experiment.

## Review and evidence
- Independent reviewer found Space keyup leaking into the global voice handler. Reproduced with a failing Playwright test; isolated keyup inside the camera toolbar and verified desktop regression green.
- Initial browser assertions were too strict for ongoing interpolation; behavior tests now use reduced motion and a 5 mm persistence tolerance. Default motion was also inspected in the first desktop/mobile smoke pass.
- Environment implementation is original procedural geometry informed by Folio View.js, MeshDefaultMaterial.js, Reveal.js and InteractivePoints.js at revision 41046b57. No Folio assets or renderer were imported.

Final validation: pnpm check passed (185 tests, web/API builds and API health smoke). Playwright: 7 passed, 1 intentional desktop skip for the mobile pinch test. Desktop/mobile captures cover both lessons. git diff --check passed.
