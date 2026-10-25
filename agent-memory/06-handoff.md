# Current handoff — workshop and camera

Branch: `lab-workshop-camera`, based on main `e4c5d87`. Owner approved implementing the researched Folio-inspired environment/camera direction.

Implemented dedicated follow/explore/experiment camera with drag, pinch/wheel, zoom and reset controls; orthographic orientation preserves spoken direction semantics. Added workshop dressing in the confirmed palette, lesson entry ring, subtle fan/dust movement, reduced-motion behavior, and separated mobile scene/lesson layout. Physics and both robot controllers remain unchanged. No AI/voice/team orchestration changes.

Validation: pnpm check passed (185 tests, builds and API health). Seven browser checks passed across desktop/mobile, with one intentional desktop skip for the mobile-only pinch test. Independent review found a Space-key conflict; regression reproduced then fixed and passed on both viewports. Screenshots inspected for both lessons. Not merged or pushed. Existing local skill installation remains untracked and outside this feature.
