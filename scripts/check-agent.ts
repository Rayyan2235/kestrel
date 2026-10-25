// Explicit live provider diagnostic. Prints only a reply or the error message.
import { agentTurn } from "../apps/api/src/agent.js";
try {
  const reply = await agentTurn({ botId: "pip", worldVersion: 0, world: { lesson: "pythagoras", duck: { x: 0, y: 0, yawDeg: 0, mode: "walk" }, props: [], slots: [] }, messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }], final: false }, new AbortController().signal);
  console.log(JSON.stringify(reply));
} catch (error) { console.log((error as Error).name, (error as Error).message); process.exitCode = 1; }
