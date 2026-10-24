# Kestrel

A science and maths playground where learners direct tiny robot companions, watch experiments unfold, and discover why together.

## Confirmed product direction

- Roughly ages 13–16, with mission-led learning, predictions, experiments and explanations.
- Two to three expressive 3D, BD-1-inspired companions inside an Open Space-inspired isometric lab.
- Human speech or typed requests lead to public thought bubbles, chirps and supported visible actions.
- Three differentiators: hands-on bot interaction, exceptional visual/interface quality, and bots talking to each other in the shared simulation.
- Bot-to-bot communication should help experiments: ask a partner to observe, propose a test, report a measured result or disagree constructively. It must retain the learner's agency.
- Projectile Playground, Moments/pivot and Pythagoras remain product directions. Moments is the recommended first slice, not a confirmed release order.
- Fresh repository. Practice work supplies evidence, not an inherited application.

## Scaffold scope

A runnable, honest foundation: two procedural placeholder robots, one illustrative balance apparatus, local scripted exchanges, selected-bot input, stop/reset, typed contracts and a local API skeleton. The preview demonstrates the UI and event flow; it is not an LLM or MuJoCo integration. No microphone recording or model requests occur.

## Next integration gates

1. Confirm opening mission and usable command set.
2. Resolve Kestrel asset provenance; integrate compatible Microduck body/MJCF/policies and benchmark one robot before two.
3. Connect server-side speech and Responses API through validated tools; measure response time and costs.
4. Implement visible station actions and actual outcomes; preserve model assumptions.
5. Add bounded model-driven bot exchanges with user-visible intent, turn/time/token budgets, object ownership and immediate stop/reset.
6. Validate a learner prediction/explanation task, target device and demo duration.

The simulation owns scientific state; the model proposes bounded actions and explains observed results. Bubbles show public plans and explanations, not hidden chain of thought. A new visual shell does not confer gripping, agility or learned locomotion.

## Cost and autonomy

Local navigation/physics never call the LLM per frame. One provider can serve distinct bot sessions. Proposed initial live exchange limit: at most two bot turns per user-triggered collaboration, with a hard stop and reset version; validate this UX with the owner. No endless background conversations.

## Youth-facing deployment

A teammate scaffold is not ready for child deployment. Follow provider under-18 guidance, minimize retained data and implement age-appropriate behavior before learner testing. The earlier offline preference concerned the practice demo; this scaffold also defaults to offline development for reproducibility.
