# Interactive lab foundation

## Direction contract

The room is the interface: a miniature science workshop with the balance apparatus
at its center and two clearly addressable companions. This extends the existing
ivory, botanical green, coral and teal world. The apparatus remains a development
fixture; it does not choose the opening mission.

Desktop gives most of the viewport to the room, with measurements below, an
optional narrow conversation window beside it, and commands underneath. Mobile
puts commands before conversation. The signature interaction is a request becoming
a visible, addressed action, then an actual measured result. Projected name tags
and short public bubbles connect the HTML interface to the 3D crew.

The scene consumes simulation snapshots and shared fixture geometry. It never
computes authoritative movement, collisions or outcomes. Cosmetic gaze and
illustrative tilt respect reduced motion. Keyboard controls and textual results
remain available when WebGL fails. No new dependencies or external assets.

## Implementation plan

- [x] Fit the isometric camera to desktop/mobile; render shared poses and station
      dimensions; anchor bot labels and feedback to projected positions.
- [x] Add exact distance entry with persistent labelled validation and a range
      control that commits once per gesture. Keep recipient, progress, Stop and
      Reset visible. Preserve conversation routing and scroll behavior.
- [ ] Verify keyboard entry, cancellation/reset, stale results, conversation,
      reduced motion, WebGL fallback and desktop/mobile layouts; run `pnpm check`.

Review focus: selection must not retarget an accepted action; reset must clear
drafts and invalidate late results; a rejected attempt must not hide ongoing
work; mobile commands must remain reachable; frame updates must not flood live
regions. Runtime behaviors are exercised with the integrated runtime, not a
second presentation-side action engine.

## Research and source decisions

- [Townscaper](https://www.townscapergame.com/) describes configuration-dependent
  construction. [Stålberg’s development announcement](https://store.steampowered.com/news/posts/?appids=1291340&enddate=1597850222&feed=steam_community_announcements)
  documents handcrafted pieces and add/remove, camera and undo controls. Our
  design inferences are direct manipulation, readable consequences and easy
  recovery. No claim is made about its proprietary implementation.
- [Wave](https://oskarstalberg.com/game/wave/wave.html) is a separate demo. Text
  inspection returned a loading marker; no interactive behavior was verified,
  and no source from it is used here.
- UIArc’s [AI documentation](https://uiarc.dev/docs/ai) and
  [installation guide](https://uiarc.dev/docs/installation) describe selective
  component installation. We inspected the free
  [scrub input](https://uiarc.dev/components/scrub-input) and
  [segmented control](https://uiarc.dev/components/segmented-control), including
  their public registry source. Both require Motion and local motion tokens.
  The [public source](https://github.com/kuratlielia/arc-library) is MIT,
  copyright 2026 Elia Kuratli; Pro has a separate access boundary.
  No code is copied: visible native range/number controls better explain the
  bounded experiment than pointer-lock scrubbing, and the existing recipient
  buttons already express selection. No installation or token replacement.

## Capability boundary

Bots and conversations are original procedural placeholders and scripted replies.
The static interface fixture is explicitly labelled until the runtime is present.
Game-controlled station actuation is not learned locomotion, gripping or contact
physics. The ideal massless beam’s tilt is illustrative; distances use the shared
enlarged display scale. Voice and live model services are outside this surface.

## Verification

Baseline: Node 24.16.0, pnpm 9.15.9; `pnpm check` passed 9 tests, typecheck,
both builds and API health. Desktop 1440×1000 and mobile 390×844 captures were
inspected before changes. The baseline mobile room was cropped and commands
followed the full conversation panel. Vite reports a large lazy 3D chunk.

Interface-only verification: `pnpm check` passed 10 tests, typecheck, both builds
and API health. `KESTREL_TEST_PORT=5190 pnpm test:e2e` passed all 12 desktop/mobile
checks. The exact-entry regression was observed failing before implementation.
The fallback test initially had a TypeScript `this` annotation error; fixed and
rechecked. Expected WebGL-context errors occur only in the forced-fallback test.

First implementation captures (`test-results/kestrel-desktop.png`,
`kestrel-mobile.png`, `fallback-desktop.png`, `fallback-mobile.png`) were inspected.
The mobile room now fits; commands precede chat; validation and fallback remain
usable. Name tags were moved below robots after inspection to uncover the beam.
Final runtime integration and confirmation captures remain pending.
