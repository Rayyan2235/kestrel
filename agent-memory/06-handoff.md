# Handoff

_Rewrite this file at the end of every session. Last rewritten: 2026-10-24, end of the first Claude Code session._

## The goal (teammate slice, see `08-current-scope.md`)

**The point of this slice is the voice flow:**
1. The learner speaks.
2. Audio is captured and transcribed.
3. The bot understands the request in context: the lesson, the world and its abilities.
4. The bot acts and teaches, out loud, with a bubble and chat history.

The Pythagoras squares are the first lesson it acts on. The environment exists to serve that loop. It is not the deliverable.

## Honest state

### Works (verified)

- **Lab sandbox** at `http://127.0.0.1:5180/sandbox.html`, **not** `/`, which is the old scripted preview.
  - Real Microduck physics and policies at 50 Hz.
  - Keyboard driving: verified headless that the arrow key moves the duck about 28 cm in 3 s and D turns it.
- **Typed commands through the fixed parser** (`parseDuckTask`). "push the 3 square to its slot" completes in about 30 s and lights the slot.
- **Bubble and chat history** for the duck's replies.
- **Credentials.**
  - ElevenLabs key: present, with permissions fixed. It passes read-only checks on user, models and voices.
  - AWS IAM key (`AKIA…`, us-east-1): signs requests correctly.
- **Model choice.** Claude Sonnet 4.6 on Bedrock (`global.anthropic.claude-sonnet-4-6`, legacy `AnthropicBedrock` client) scored 6/6 on the terminal bench; local qwen2.5:1.5b scored 4/6.
- **Tests.** `pnpm check` passed after the sandbox was added: 18 tests, both builds.

### Not built (the core of the request)

- No microphone capture, no speech-to-text, no Claude in the app, no text-to-speech.
- `apps/api/src/` still has only `/api/health` and the 501 `/api/commands` stub.
- ElevenLabs has **never** done a real transcription or synthesis. Only the key was checked.
- Claude has only run from `apps/api/scripts/agent-bench-bedrock.mjs`, against **simulated** tool results, never against the live sim.

### Failed or unreliable

- "push the 5 square to its slot" often gives up. The waypoint push planner and the policy's turning radius are the cause.
- The **teammate's first real test failed.**
  - They opened `/` instead of `/sandbox.html`. The link from `/` is a tiny header text, so keys did nothing.
  - On the right page, natural questions like "what is the pythagorean theorem" and "show me why 9 plus 16 equals 25" got only the parser fallback ("I know: walk forward 20 cm, …"). The text box is not AI.
- **Disk.** C: has filled to 0 GB twice. The second time, writing `apps/api/src/agent.ts` and `voice.ts` failed, and nothing was left on disk. Before the session ended the user freed space (about 0.57 GB free at the end). Check free space before installing or writing much.

## Next steps, in this order

1. **Check disk space** (`(Get-PSDrive C).Free`). If it's under about 1 GB, ask the user to free space before writing anything.
2. **Server routes** in `apps/api/src/`. Keys stay server-side. Load `.env` in `index.ts` with `process.loadEnvFile`.
   - **`POST /api/voice/transcribe`.** Audio body (`audio/*`, ≤10 MB) goes to ElevenLabs `POST https://api.elevenlabs.io/v1/speech-to-text`, multipart with `model_id=scribe_v2`, `file` and `language_code=en`, header `xi-api-key`. It returns `{ text }`. Don't store audio.
   - **`POST /api/agent/turn`.**
     - The request carries the lesson, the duck pose and mode, the props (id, label, movable), the slots (filled) and the `messages` (text, tool_use and tool_result blocks only), all Zod-validated.
     - It calls Bedrock Sonnet 4.6 with a system prompt: plain spoken sentences, no markdown or emoji, 1–3 sentences, one action at a time, never claim an outcome before the tool result, hint instead of the homework answer, refuse impossible skills.
     - Tools mirror `DuckTaskSchema`, with enums built from the current prop ids.
     - It returns text and tool_use blocks.
     - **Don't send `temperature`**: API version `2026-10-21` rejects sampling parameters.
   - **`POST /api/voice/speak`.** `{ text ≤ 600 }` goes to ElevenLabs `POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_64`, JSON `{ text, model_id: "eleven_flash_v2_5" }`, with markdown and emoji stripped first. It returns `audio/mpeg`. Default voice: Matilda `XrExE9yKIg1WjnnlVkGX` unless `ELEVENLABS_VOICE_ID` is set.
3. **The agent loop in the sandbox (the browser owns it).**
   - Send the user text plus the world snapshot to `/api/agent/turn`.
   - For each `tool_use`: map it to a `DuckTask`, validate it with `DuckTaskSchema`, call `sim.runTask()`, await the `task-done` event, and send its summary back as a `tool_result`.
   - Repeat for up to 6 steps.
   - Show text blocks in the bubble and log, and queue them for TTS.
   - Esc, Stop or a new utterance cancels everything through an epoch token: the sim task, pending fetches and audio.
4. **UI.**
   - Add a **Hold to talk** button (and holding Space when not typing) with MediaRecorder, showing listening → transcribing → thinking → acting → speaking.
   - Typed text the parser doesn't recognise goes to Claude too, so it can be tested without a mic.
   - Add a voice on/off toggle.
5. **Verify end to end yourself before telling the user it works.**
   - A real STT call: synthesise a test phrase with TTS, then transcribe it.
   - A real Claude call driving the live sim: "show me why 9 plus 16 equals 25" should push the squares.
   - Real TTS playback. Report measured latencies.
6. Make the sandbox easy to find: a prominent link or button on `/`, or tell the user the exact URL every time.
7. Then improve the 5×5 push, add a Playwright spec for the 3×3 push and the voice-off agent path, and re-run `pnpm check` and `pnpm test:e2e`.
8. Later: a second duck for the good-teacher/bad-teacher mode.

## Files and state

- `.env` (gitignored) has `ELEVENLABS_API_KEY`, `AWS_REGION=us-east-1`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. There's no session token (the key is permanent).
  - `BEDROCK_MODEL_ID` still says `anthropic.claude-haiku-5-5`, which **is not available to this account**. An edit to change it failed on the full disk. Set it to `global.anthropic.claude-sonnet-4-6`.
  - Never print or commit these values.
- **Uncommitted:** `agent-memory/`, `apps/web/public/microduck/`, the sandbox and simulation code, contracts `lab.ts`, the API scripts, `@anthropic-ai/bedrock-sdk@1.1.0` in `apps/api`, and edits to `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `App.tsx` and `vite.config.ts`.
- Temporary probes live in `tests/.probe-*.mjs`. They're not part of the suite; delete them or turn them into specs.
- **Export:** `../kestrel-duck-sandbox.zip` (6.4 MB, with a README) holds the sandbox and simulation files for sharing.
- **Upstream reference:** `../upstream/microduck-simulator` (rev `ad9d41a`).
- **Dev servers** may still be running in the background on :5180 and :5181.

## Blocked / needs owner

- TTS adoption and the provider change: ElevenLabs plus Claude on Bedrock versus the planned OpenAI.
- Youth data terms for ElevenLabs and Bedrock.
- Microduck asset licences.
- Bedrock access to newer models (Haiku 5.5, Sonnet 5 and 5.5) is unavailable to this account. Haiku 4.5 needs the `aws-marketplace:Subscribe` and `aws-marketplace:ViewSubscriptions` IAM permissions.
