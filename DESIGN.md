# Kestrel visual direction

## Authority

Owner-selected: expressive 3D Kestrels in an isometric science lab. Open Space is an important reference for inhabited rooms, compact agent windows, distinct identities and thought bubbles. The owner's latest clarification explicitly calls for independent research, creative judgment and an original Kestrel identity; Open Space is one influence, not a fixed visual specification. No final asset or rendered reference is copied into this scaffold.

## Creative direction and research

Proposed direction: a beautiful miniature science workshop. Tactile apparatus, carefully lit materials, expressive robot silhouettes and compact controls should make the room inviting to explore. Aim for playful sophistication appropriate to teenage learners. The current scaffold's palette, font and layout are a starting point, not approved final art.

Research informs specific choices rather than prescribing a composite of other products:

- [Open Space](https://github.com/Fantomiald/open-space): study crew identity, room presence and readable agent conversation.
- [Townscaper](https://www.townscapergame.com/): its toy-like building premise and immediate transformations suggest making each experiment adjustment visibly satisfying.
- [Duolingo's craft process](https://blog.duolingo.com/core-tabs-redesign/): study deliberate typography, spacing and the balance between simplicity and clarity; evaluate a few distinct directions before settling the final design.

Kestrel's own signature should be visible collaboration: a bot turns to a peer, asks for a measurement, the peer checks the apparatus, and both react to the observed result. Selection, gaze, short bubbles and apparatus feedback should tell one coherent story. This is design intent for future implementation, not a claim about the scripted scaffold's capabilities.

## First surface

Mode: Experience with an Operate layer. The room leads; conversation and measurements support it. A child should recognize the crew, select a recipient, try a change and observe the result within seconds.

## Tokens

- Typeface: self-hosted Plus Jakarta Sans Variable via Fontsource.
- Ink: #203b33; secondary ink: #536960; canvas: #e9ede4; panel: #fbfcf7.
- Dark dock/window: #18352c; on-dark ink: #f2f6ed; on-dark secondary: #bfcfc3.
- Primary accent: #d2eb88, used with dark ink; robot identities: coral #dc8060 and teal #5caca4.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48px. Panels 16px radius; small controls 10px; compact identity controls may be pills.
- Elevation: soft offset shadow, no decorative glow. Focus: visible 3px dark/teal ring on light surfaces, pale-green ring on dark surfaces.

## Composition and behavior

A quiet top bar, broad 3D room stage, floating compact lesson control and bot conversation window. Bottom crew selector and command input. Warm ivory room pieces, muted green floor, soft lighting and original geometric placeholder bots. Start readable, not a dark engineering grid. Measurements use tabular numerals and units. Selection, busy, unavailable and reset states must be understandable without color alone.

Responsive: below 900px place the chat below the stage; maintain full-width commands and controls. Respect reduced motion. Always offer keyboard-accessible HTML bot selection in addition to scene picking. WebGL failure preserves the controls and explains why the room cannot render.

## Scaffold boundary

This is an initial visual foundation, not final art. Robots are original procedural placeholders pending approved Kestrel assets. Preview conversation is labeled scripted. Advanced tools appear only when implemented; avoid disabled decorative buttons masquerading as product features.

## Earlier sandbox window treatment — superseded for console

The `/sandbox.html` windows and controls use the owner-selected Nox Noir `#141414`, Royal Amethyst `#7E49B3`, and Steel Mist `#CFCFCF`. Soft white `#F5F3F7` is the implementation choice for text and primary pill buttons; pale amethyst supports readable focus and state labels. These tokens are scoped to the sandbox. The earlier preview and 3D materials retain their existing styling.

Lesson, console and speech surfaces use dense smoked glass, subtle silver edges and offset shadows, informed by Open Space. Primary buttons are light pills with amethyst text; secondary buttons use translucent neutral fills. The supplied button reference informed the pill shape and 2px hover lift. Controls have 44px minimum height, visible focus, disabled states and reduced-motion support. Glass has an opaque fallback and a reduced-transparency treatment.

## Integrated product entry — October 25, 2026

The illustrated welcome page is the root route. Every Open console action leads directly to `/console`, the existing real Microduck lab. Home returns to the welcome page; the old scripted preview screen is removed. The console glass now uses a dark purple tint (`rgb(34 23 45 / 80%)`) and lavender-lit silver edges; brand colors stay unchanged. Welcome display lettering is self-hosted Grandstander; body text is Plus Jakarta Sans. Owner-supplied concept art remains distinct from runtime physics.

## Earlier console workshop environment — superseded

The owner-approved Folio-inspired workshop extends the noir/amethyst/silver identity into the 3D scene. Pale silver flooring keeps the science readable; graphite walls/cabinetry and amethyst inlaid lighting establish depth. Recessed wall panels, cabinet handles, flush dock markings, a slow wall fan and sparse dust provide peripheral detail. A brief expanding floor ring marks lesson entry; reduced motion disables it and ambient movement. The orthographic view retains a fixed angle for screen-relative robot commands. A compact purple glass camera toolbar provides follow, frame, zoom and reset; drag/pinch exploration persists until the learner changes mode. Mobile separates the lesson panel vertically from the scene.

## Botanical Studio console — superseded by the playground below

Current authority for `/console`, `/lab`, and `/sandbox.html`: warm stone `#E8E2D6`, forest `#293D35`, sage `#9BAE97`, brass `#B99250`, clay `#BC816B`. The landing page is unchanged. Light shell/header; forest glass panels (`rgb(35 55 45 / 92%)`), ivory foreground `#F3EEE3`, sage secondary foreground `#CED6C7`, forest active controls and brass focus accents. Robot identity colors are preserved.

The room uses original oak floor/worktop maps, plaster walls, a flush stone experiment inlay, recessed cabinet fronts, brass fittings, shelves/books/jars, curved leaf geometry, window mullions and a task lamp. Offline AO maps add contact/corner shading to static surfaces; they are not full global-illumination bakes. Moving robots and apparatus retain real-time shadows, with a filtered studio environment for material highlights. The wall monitor shows measured robot positions. Reduced motion stops fan/dust animation.

Reference implementation studied using REA and direct source inspection: `brunosimon/my-room-in-3d` at 5d00b3f. No reference assets are redistributed. (Its workshop assets were removed with the playground; see `apps/web/src/sandbox/PROVENANCE.md`.) Preserve the existing camera controls and fixed angle. Physically reachable apparatus geometry and all simulator state remain authoritative.

### Classroom refinement

The owner retained Botanical Studio and asked for a shared classroom character. The room now prioritizes a lesson-specific teaching board, chalk tray, organized equipment labels, and an open learning station over decorative studio shelving. Preserve daylight and tactile materials. Diagrams explain concepts; only simulation-backed displays report measurements. See `docs/handoffs/claude-code-classroom-redesign.md` for the Claude Code continuation workflow.

## Playground console — owner direction, October 25, 2026

Current authority for `/console`, `/lab` and `/sandbox.html`. The owner replaced the classroom with a bright outdoor playground and asked for the whole floor to be open to the robots. (Navy and brass was chosen for the classroom minutes earlier and is superseded with it.)

**World.** A floating grass island in a blue sky. The 3 m court is an open poured-rubber surface with no furniture: the robots get the whole floor. A storybook white picket fence (scalloped pickets, rails, ball-capped posts, climbing roses, a flower bed) sits exactly on MuJoCo's 25 cm boundary wall, inner faces on the collider line. All equipment stands outside that line on the lawn, so none of it needs a collider: swings (their sway uses the real pendulum period for the chain length), a slide, a seesaw resting on one end (the Moments lesson at play size), a sandpit, a bench, bunting and a lesson chalkboard turned to face the fixed camera. The board draws each lesson's rule to scale (3-4-5 squares; 200 g × 10 cm = 100 g × 20 cm); it is a diagram, never a measured result. Flush painted cues only: a dashed learning-zone circle around the experiment and a hopscotch.

**Realism.** Leafy canopies and lawn blades follow folio-2025's `Foliage.js` and `Grass.js` techniques (camera-facing alpha-cut leaf cards with sphere-blended normals; one-triangle blades with up normals and tip-only wind), reimplemented in WebGL with original textures. Clouds ring the island, placed by screen position so none ever covers the court. Midday sun from the front left, sky/grass hemisphere bounce. Reduced motion stops swings, bunting, leaves, grass and clouds.

**Interface.** The playground fills the screen; every panel floats over it as General Intelligence Company glass, using the owner's design-system artifact: exact tokens, ArrowPill, solid and link buttons, GlassNav structure, field, 36px icon buttons, and the site's tag pill. Text surfaces use the system's light glass (the toast recipe: white 60% over a 20px blur, ink text) because the source's dark 7–12% panel tint is drawn for night imagery; over a sunny scene white text on it would not be legible. Inter replaces Plus Jakarta Sans in the console (the system names Inter as its stand-in face). The nav sits top left (no Home button; the Kestrel mark links home), the lesson card under it, the console on the right, keyboard help and camera controls along the bottom. On phones the panels stack around a full-width scene.

**Low power.** On a software WebGL renderer (SwiftShader, llvmpipe) the scene drops shadows and grass blades and renders at half resolution; `?hq` forces full quality for design screenshots. Physics is unaffected.

### Objectives and console windows (October 25, 2026)

The right rail now stacks two glass cards: **Objectives** on top, the console below. Objectives lists Balance the beam, Build the right triangle and Rescue Pip, each worth 100 XP. Picking one sets up its challenge and shows a gold XP bar that stays empty until the simulator measures the goal met, then fills. The list collapses once an objective starts. Inside the console, **You and Pip** and **Pip and Nova** are collapsible windows (one open at a time, remembered per browser). A closed window is a single header row with the robot's live state and an unread count. Robots answer with a short robot sound, and their words appear only in the think bubble and the log.
