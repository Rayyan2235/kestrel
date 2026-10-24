# Runtime boundaries

The browser owns preview state. The future local simulation will own the authoritative world; UI stores sampled snapshots, selected recipients and conversation state. Physics/policy loops stay outside React re-renders and network/model latency.

Voice → transcript bound to the selected bot at capture start → server-side model with compact lesson/world/context → typed tool request → current-state/capability validation → task executor → actual result → grounded bubble.

Bot-to-bot messages have an explicit sender, recipient, shared world version and purpose. A coordinator enforces per-exchange turn/time/token budgets, blocks recursive self-triggering, serializes object conflicts and returns control to the learner. Different robot sessions can share one model service. Two autonomous agents do not imply two unconstrained infinite loops.

The scaffold's deterministic preview has no live provider. It captures the initiator when an exchange starts, queues two addressed messages, and discards them when stop, reset, a new command or a manual world edit changes the epoch. Repeated/out-of-order delivery is ignored. Conversation display is capped at 30 messages.

Scientific quantities have units and declared assumptions. An LLM answer cannot mutate state or substitute for a measured result. MuJoCo locomotion requires a compatible body, observation layout, policy, timestep and runtime; an attractive reskin is a separate concern from controller validity.

OpenAI is the proposed initial live provider. See its under-18 API guidance before learner deployment. Gemini's current API terms conflict with this youth-facing audience; historical sponsor recommendations are not accepted architecture.
