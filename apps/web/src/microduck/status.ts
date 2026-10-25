import { create } from "zustand";

/** What the interface says about the physics: loading, running (with its control rate), or failed. */
export type MicroduckStatus = { state: "loading" | "running" | "failed" | "disabled"; error?: string; hz: number; falls: number };

/** `?physics=off` runs the lab with the placeholder robots and the authored controller (software-WebGL CI). */
export const physicsDisabled = () => {
  try {
    return new URLSearchParams(location.search).get("physics") === "off";
  } catch {
    return false;
  }
};
export const useMicroduck = create<MicroduckStatus>(() => ({ state: physicsDisabled() ? "disabled" : "loading", hz: 0, falls: 0 }));

/** The floor balance as the interface shows it, sampled from the physics loop. */
export type BalanceStatus = { available: boolean; locked: boolean; angle: number; leftCm: number; rightCm: number };
export const useBalance = create<BalanceStatus>(() => ({ available: false, locked: true, angle: 0, leftCm: 20, rightCm: 20 }));
