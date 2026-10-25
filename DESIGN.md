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

## Sandbox window treatment — October 25, 2026

The `/sandbox.html` windows and controls use the owner-selected Nox Noir `#141414`, Royal Amethyst `#7E49B3`, and Steel Mist `#CFCFCF`. Soft white `#F5F3F7` is the implementation choice for text and primary pill buttons; pale amethyst supports readable focus and state labels. These tokens are scoped to the sandbox. The earlier preview and 3D materials retain their existing styling.

Lesson, console and speech surfaces use dense smoked glass, subtle silver edges and offset shadows, informed by Open Space. Primary buttons are light pills with amethyst text; secondary buttons use translucent neutral fills. The supplied button reference informed the pill shape and 2px hover lift. Controls have 44px minimum height, visible focus, disabled states and reduced-motion support. Glass has an opaque fallback and a reduced-transparency treatment.

## Integrated product entry — October 25, 2026

The illustrated welcome page is the root route. Every Open console action leads directly to `/console`, the existing real Microduck lab. Home returns to the welcome page; the old scripted preview screen is removed. The console glass now uses a dark purple tint (`rgb(34 23 45 / 80%)`) and lavender-lit silver edges; brand colors stay unchanged. Welcome display lettering is self-hosted Grandstander; body text is Plus Jakarta Sans. Owner-supplied concept art remains distinct from runtime physics.
