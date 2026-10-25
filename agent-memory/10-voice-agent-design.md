# Voice and agent design (proposed, not built)

## Layering: the LLM does not replace the Microduck weights

```
speech ──STT──▶ transcript (bound to the selected bot at capture start)
          │
          ▼
   Agent LLM (Qwen local / Bedrock)      ~1 call per learner turn
   in:  lesson pack + world snapshot + bot's recent history + tool list
   out: { say: "…", tasks: DuckTask[] }  ← Zod-validated
          │
          ▼
   Task runner (apps/web/src/simulation/tasks.ts)   50 Hz, deterministic
   go_to / push / turn … → velocity commands (vx, wz) + skill triggers
          │
          ▼
   Microduck ONNX policies (trained weights)        50 Hz
   61-D observation → 14 joint targets (walk, sit, kick, roll, peck, get-up)
          │
          ▼
   MuJoCo physics → measured result → back to the agent and the bubble
```

- The **ONNX policies are the muscles.** They only understand a velocity or posture command. They know nothing about language, squares or lessons.
- The **task runner is the cerebellum.** It turns "push the 5×5 square to its slot" into a sequence of velocity commands, and it reports the measured outcome.
- The **LLM is the brain.** It turns speech into bounded tasks plus an explanation. It never writes joint angles or per-frame commands, and it never claims an outcome the simulation didn't measure.
- New motions such as a dedicated push, a sidestep or a jump need **new trained policies** (Isaac Lab + RSL-RL, exported to ONNX with the same 61/14 interface). That is separate from the LLM.

## Pipeline

1. **Capture.** Hold to talk in the browser (MediaRecorder, webm/opus). Bind the recipient bot ID when recording starts. Show listening, thinking and acting states.
2. **STT.** `POST /api/voice/transcribe` → ElevenLabs Speech-to-Text (Scribe). The key stays server-side in `apps/api`. Don't store audio.
3. **Agent.** `POST /api/agent/turn` with `{ botId, transcript, worldSnapshot, lessonId, worldVersion }`. The server calls the agent provider with a system prompt (persona, the hint-before-solution policy from ADR 0004, honesty rules) and the tools generated from `DuckTaskSchema`. It returns `{ say, tasks }` and validates them with Zod. The prompt says: no hidden reasoning in `say`, and only use the tools listed.
4. **Act.** The browser runs each task through `DuckSim.runTask`. Stale `worldVersion` or a reset cancels pending work. At most one follow-up model call narrates the measured result.
5. **Speak.** `POST /api/voice/speak` → ElevenLabs TTS, streamed audio. The bubble shows the text immediately, and the chat log keeps the full history.

## Providers (narrow interface, one implementation each)

- `AgentProvider.turn(messages, tools) → { say, toolCalls }`
  - `openai-compatible`: local Qwen through Ollama, LM Studio or vLLM (`/v1/chat/completions` with tools). Needs the endpoint URL and model name.
  - `bedrock`: AWS Bedrock Converse API with tool use (for example a Claude model on Bedrock). Needs the AWS region, credentials profile and model ID.
- `SpeechProvider.transcribe(audio)` / `.speak(text, voice)`: ElevenLabs. Needs `ELEVENLABS_API_KEY` and a voice ID per bot.
- Env vars (in `.env`, never `VITE_`): `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_PIP`, `AGENT_PROVIDER`, `QWEN_BASE_URL`, `QWEN_MODEL`, `AWS_REGION`, `BEDROCK_MODEL_ID`.

## Model selection (2026-10-24, not yet decided)

- **Local Qwen on this machine.** It runs in **Ollama 0.40.8**, which is already running at `http://127.0.0.1:11434` (OpenAI-compatible endpoint `/v1`). The only chat model installed is `qwen2.5:1.5b` (Q4_K_M, about 1.2 GB, loads on the RX 6550M). The other models are embeddings (`qwen3-embedding:0.6b`, `snowflake-arctic-embed`).
- **Hardware.** Ryzen 5 7535HS, 23 GB RAM, RX 6550M with 4 GB VRAM, and **only 3.1 GB of disk free**. Models of 7B and up don't fit.
- **Benchmark.** `node scripts/agent-bench.mjs <baseURL> <model>` runs 6 cases with the real tool list. qwen2.5:1.5b scored **4/6**. It passes single push, refusal, hint-not-answer and explain. It fails multi-step (writes the steps as text) and the demonstration (pushes nothing). Warm calls take 0.2–0.9 s; a cold load takes 9.7 s.
- **Recommendation (pending the teammate and owner).**
  - Keep the deterministic parser as a fast path.
  - Use Claude Haiku 5.5 on Bedrock (`anthropic.claude-haiku-5-5`, effort `low`) as the brain. Escalate to Sonnet 5.5 only if quality needs it.
  - Keep local Qwen as the offline fallback.
  - Decide by running the expanded bench (about 30 cases) on all candidates.
- Explainer: https://claude.ai/artifact/YMQK6wK3QcdsP3ZTJKVVRg

### Result on the real Bedrock account (2026-10-24): chosen agent is Claude Sonnet 4.6

- **Account access (us-east-1, permanent IAM key `AKIA…`, no session token).**
  - `global.anthropic.claude-sonnet-4-6` works on the legacy Bedrock route (`AnthropicBedrock` client).
  - Haiku 4.5 needs the IAM user to have `aws-marketplace:Subscribe` and `aws-marketplace:ViewSubscriptions` to enable it.
  - Haiku 5.5, Sonnet 5 and Sonnet 5.5 are not offered to this account on the Mantle route (404/403).
  - Sonnet 4.5 rejects SDK API version `2026-10-21`.
- **Benchmark with an agent loop** (each tool's simulated result fed back, up to 6 steps):
  - Sonnet 4.6 scored **6/6**: it does go_to → push, turn → move, and all three go_to/push pairs for the demonstration. It refuses jump and gives a hint for homework.
  - qwen2.5:1.5b scored **4/6** and still never chains tools.
- **Sonnet 4.6 numbers.** About 1–2 s per model step, so the 3-square demonstration takes about 5.8 s over 6 steps. It used 21.7k input and 1.0k output tokens across 6 requests, about $0.08 at list price; Bedrock bills separately. Prompt caching should cut the repeated system and tools cost.
- **Prompt fixes needed before TTS.** Sonnet emits markdown (`**…**`) and emojis. Add "plain spoken sentences only, no markdown or emoji" to the system prompt and strip them before TTS.
- **Scripts:**
  - `node --env-file=../../.env scripts/bedrock-check.mjs [ids…]` (from apps/api) runs a one-call access check.
  - `scripts/agent-bench-bedrock.mjs` (apps/api) runs the bench on Bedrock.
  - `scripts/agent-bench.mjs` (repo root) runs the bench on any OpenAI-compatible endpoint.
- The local Qwen stays as an offline fallback only. This is the teammate's choice; the owner should confirm, since the planning notes proposed OpenAI.

## Open questions for the owner and the team

- TTS was "not selected" in the planning notes. This slice adds it. Confirm with the owner.
- Youth audience: check ElevenLabs data-retention terms and the Bedrock and Qwen policies for under-18 use before any learner testing.
- Latency budget per turn (STT + LLM + TTS). Measure it once it's built.
