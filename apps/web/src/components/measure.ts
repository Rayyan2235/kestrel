import { balance, BOT_NAMES, type BotId, type SimulationSnapshot, type World } from "@kestrel/contracts";

const G = 9.81;
const nf = new Intl.NumberFormat("en-US");

/** Display arithmetic on the authoritative world: mass × distance and torque. */
export function turning(world: World) {
  const left = world.leftGrams * world.leftCm;
  const right = world.rightGrams * world.rightCm;
  return {
    left,
    right,
    leftNm: (world.leftGrams / 1000) * G * (world.leftCm / 100),
    rightNm: (world.rightGrams / 1000) * G * (world.rightCm / 100),
    state: balance(world),
  };
}

export const formatInt = (n: number) => nf.format(Math.round(n));
export const formatNm = (n: number) => n.toFixed(3);

export function verdictText(state: "left" | "right" | "balanced") {
  return state === "balanced" ? "Balanced" : state === "left" ? "Left side turns harder" : "Right side turns harder";
}

const phaseText = {
  approach: "walking to the bench",
  dock: "lining up at the control",
  operate: "turning the weight control",
  done: "finishing",
} as const;

export function actionStatus(sim: SimulationSnapshot): { text: string; tone: "idle" | "busy" | "done" | "stopped" | "failed" } {
  const active = sim.activeAction;
  if (active) {
    const side = active.request.objectId === "left-weight" ? "left" : "right";
    return {
      text: `${BOT_NAMES[active.request.botId]} is ${phaseText[active.phase]} · ${side} weight to ${active.request.parameters.positionCm} cm`,
      tone: "busy",
    };
  }
  const last = sim.lastAction;
  if (!last) return { text: "Pick a weight on the beam, or type a request.", tone: "idle" };
  const side = last.request.objectId === "left-weight" ? "left" : "right";
  const name = BOT_NAMES[last.request.botId];
  if (last.status === "completed")
    return { text: `${name} moved the ${side} weight to ${last.request.parameters.positionCm} cm.`, tone: "done" };
  if (last.status === "cancelled") return { text: `Stopped. ${name} left the ${side} weight where it was.`, tone: "stopped" };
  return { text: last.error?.message ?? `${name} could not finish.`, tone: "failed" };
}

export function peerOf(id: BotId): BotId {
  return id === "pip" ? "nova" : "pip";
}
