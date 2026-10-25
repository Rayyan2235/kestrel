import { VEL_ANG, VEL_BACK, VEL_FWD, VEL_STEER, VEL_TURN_WALK } from "../simulation/constants";

export type Pose = { x: number; y: number; yaw: number };
export type Twist = { vx: number; wz: number };
/** A round: turn to face, charge, back off, repeat. */
export type FightPhase = "face" | "charge" | "recoil";

export const FIGHT = {
  /** Facing within this, in radians, starts the charge. */
  facedRad: 0.25,
  /** A charge that has not clashed by now backs off and tries again. */
  chargeMs: 6000,
  recoilMs: 1100,
};

/**
 * A fast clash: the trunks close inside `distance` while approaching faster
 * than `closing` m/s, measured over `windowMs` (a walking trunk sways a
 * centimetre or two each step, so a shorter window reads that wobble as
 * speed). Charges measured 0.6 to 0.76 m/s here. After a clash the robots
 * must part beyond `rearm` before another one counts.
 */
export const CLASH = { distance: 0.2, closing: 0.45, windowMs: 300, rearm: 0.3 };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** How far `self` must turn to face `other`, radians, positive = left. */
export function aimError(self: Pose, other: Pose): number {
  return wrap(Math.atan2(other.y - self.y, other.x - self.x) - self.yaw);
}

/** Turn on the spot toward the other robot. */
export function faceTwist(err: number): Twist {
  return { vx: 0, wz: Math.sign(err) * Math.min(VEL_ANG, Math.max(1.2, Math.abs(err) * 4)) };
}

/** Full speed at the other robot, steering as it goes; slow down to turn if it dodged. */
export function chargeTwist(err: number): Twist {
  if (Math.abs(err) > 0.6) return { vx: VEL_TURN_WALK, wz: Math.sign(err) * VEL_STEER };
  return { vx: VEL_FWD, wz: Math.max(-VEL_STEER, Math.min(VEL_STEER, err * 2.5)) };
}

export const RECOIL: Twist = { vx: VEL_BACK, wz: 0 };

export function distance(a: Pose, b: Pose): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Closing speed from two distance samples `dtS` seconds apart (at least `CLASH.windowMs`). */
export function isClash(prevDist: number, dist: number, dtS: number): boolean {
  return dtS > 0 && dist < CLASH.distance && (prevDist - dist) / dtS > CLASH.closing;
}
