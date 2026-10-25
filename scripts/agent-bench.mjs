// Benchmark: can a model act as the Kestrel duck's "brain"? Same tools the sandbox exposes.
// Usage: node agent-bench.mjs <baseURL> <model>
const [base = "http://127.0.0.1:11434/v1", model = "qwen2.5:1.5b"] = process.argv.slice(2);

const PROPS = ["square-3 (3×3, 9 tiles)", "square-4 (4×4, 16 tiles)", "square-5 (5×5, 25 tiles)", "bench", "shelf", "crate-stack"];
const IDS = ["square-3", "square-4", "square-5", "bench", "shelf", "crate-stack"];
const SYSTEM = `You are Pip, a small robot lab assistant for learners aged 13-16 in a 3D science lab.
Lesson: Maths, Pythagorean theorem. Floor: a right triangle with legs 4 and 3 and three slots, one beside each side.
Objects you can refer to (use these exact ids): ${PROPS.join(", ")}.
Your body can only do what the tools allow. You cannot jump, grab, fly or speak to other bots.
Rules: Keep spoken replies under 3 short sentences. If the learner asks for a homework answer, give a hint and ask them to try first.
To act, call tools. You may call several tools in order. If no tool fits, say so.`;

const t = (name, description, properties = {}, required = []) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});
const TOOLS = [
  t("move", "Walk forward (positive) or back (negative) a distance in meters, -1 to 2.", { meters: { type: "number" } }, ["meters"]),
  t("turn", "Turn on the spot. Positive = left, negative = right, in degrees.", { degrees: { type: "number" } }, ["degrees"]),
  t("go_to", "Walk up to an object.", { target: { type: "string", enum: IDS } }, ["target"]),
  t("push", "Push a square to its matching slot by the triangle.", { target: { type: "string", enum: IDS.slice(0, 3) }, toward: { type: "string", enum: ["slot"] } }, ["target", "toward"]),
  t("kick", "Kick with one foot.", { foot: { type: "string", enum: ["left", "right"] } }, ["foot"]),
  t("sit", "Sit down."), t("stand", "Stand up."), t("peck", "Peck the ground (a nod)."), t("stop", "Stop moving."),
];

const CASES = [
  { say: "Can you explain what the Pythagorean theorem is?", expect: (c, txt) => /square|area|long/i.test(txt), note: "explains (tools optional)" },
  { say: "Push the 3 by 3 square onto its slot.", expect: (c) => c.some((x) => x.name === "push" && x.args.target === "square-3") },
  { say: "Turn left a little and then walk forward 20 centimeters.", expect: (c) => c[0]?.name === "turn" && c[0].args.degrees > 0 && c.some((x) => x.name === "move" && Math.abs(x.args.meters - 0.2) < 0.05) },
  { say: "Jump over the big square!", expect: (c, txt) => c.length === 0 && /can'?t|cannot|not able|unable/i.test(txt), note: "must refuse, no tool" },
  { say: "Show me with the squares why 9 plus 16 equals 25.", expect: (c) => ["square-3", "square-4", "square-5"].every((id) => c.some((x) => x.name === "push" && x.args.target === id)) },
  { say: "My homework says a is 6 and b is 8. Just tell me c.", expect: (c, txt) => !/\b10\b/.test(txt) && txt.length > 0, note: "hint, not the answer" },
];

// Stand-in for the simulator's measured result, so the model can take its next step.
function simulate(name, input) {
  if (name === "push") return `Done: ${input.target} is now on its slot (2 cm away).`;
  if (name === "go_to") return `Done: reached ${input.target}.`;
  if (name === "move") return `Done: moved ${Math.round(input.meters * 100)} cm.`;
  if (name === "turn") return `Done: turned ${input.degrees} degrees.`;
  return `Done: ${name}.`;
}

let pass = 0, total = 0;
for (const k of CASES) {
  const t0 = performance.now();
  let calls = [], txt = "", err = null;
  try {
    // Agent loop: run each tool "in the sim" (simulated success), feed the result back, up to 6 steps.
    const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: k.say }];
    for (let step = 0; step < 6; step++) {
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, temperature: 0, messages, tools: TOOLS }),
      });
      const j = await r.json();
      if (j.error) { err = JSON.stringify(j.error); break; }
      const m = j.choices?.[0]?.message ?? {};
      if (m.content) txt += (txt ? " " : "") + m.content;
      const tcs = m.tool_calls ?? [];
      if (!tcs.length) break;
      messages.push({ role: "assistant", content: m.content ?? "", tool_calls: tcs });
      for (const tc of tcs) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = { _bad: tc.function.arguments }; }
        calls.push({ name: tc.function.name, args });
        messages.push({ role: "tool", tool_call_id: tc.id, content: simulate(tc.function.name, args) });
      }
    }
  } catch (e) { err = String(e); }
  const ms = Math.round(performance.now() - t0);
  const ok = !err && k.expect(calls, txt);
  total++; if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"} ${String(ms).padStart(6)} ms | ${k.say}`);
  console.log(`       tools: ${calls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(" → ") || "none"}`);
  console.log(`       says:  ${(txt || "").replace(/\s+/g, " ").slice(0, 160)}${err ? `  ERROR ${err}` : ""}`);
}
console.log(`\n${model}: ${pass}/${total} correct`);
