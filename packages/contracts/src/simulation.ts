import { z } from "zod";
import { BotSchema, createWorld, type BotId, type World } from "./index.js";

// Schema construction is deferred past the index module's BotSchema initialization.
export const ActionRequestSchema = z.lazy(() =>
  z
    .object({
      requestId: z.string().trim().min(1).max(128),
      botId: BotSchema,
      worldRevision: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
      resetGeneration: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
      action: z.literal("move-weight"),
      stationId: z.literal("balance"),
      objectId: z.enum(["left-weight", "right-weight"]),
      parameters: z.object({ positionCm: z.number().min(5).max(45) }).strict(),
    })
    .strict(),
);
export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export type Position = readonly [number, number, number];
export type BotSnapshot = Readonly<{
  id: BotId;
  position: Position;
  headingRad: number;
  status: "idle" | "approaching" | "docking" | "operating";
}>;
export type ActionError = Readonly<{
  code:
    | "INVALID_REQUEST"
    | "STALE_WORLD"
    | "BUSY"
    | "REQUEST_ID_CONFLICT"
    | "CONTROLLER_FAILED"
    | "STOPPED"
    | "RESET"
    | "REENTRANT_CALL"
    | "CAPACITY";
  message: string;
}>;
export type BalanceMeasurement = Readonly<{
  leftGramCentimeters: number;
  rightGramCentimeters: number;
  leftNewtonMeters: number;
  rightNewtonMeters: number;
  balance: "left" | "right" | "balanced";
}>;
export type ActionRecord = Readonly<{
  request: Readonly<
    Omit<ActionRequest, "parameters"> & {
      parameters: Readonly<ActionRequest["parameters"]>;
    }
  >;
  status:
    "received" | "validated" | "started" | "completed" | "failed" | "cancelled";
  phase: "approach" | "dock" | "operate" | "done";
  progress: number;
  result?: BalanceMeasurement;
  error?: ActionError;
}>;
export type SimulationSnapshot = Readonly<{
  contractVersion: 1;
  mode: "view-fixture" | "game-controlled";
  worldRevision: number;
  resetGeneration: number;
  world: Readonly<World>;
  bots: Readonly<Record<BotId, BotSnapshot>>;
  activeAction: ActionRecord | null;
  lastAction: ActionRecord | null;
  ownership: Readonly<{
    stationId: "balance";
    objectId: ActionRequest["objectId"];
    botId: BotId;
    requestId: string;
  }> | null;
}>;
export type ActionSubmission =
  | Readonly<{ accepted: true; duplicate: boolean; action: ActionRecord }>
  | Readonly<{ accepted: false; error: ActionError }>;
export type SimulationEvent = Readonly<{
  sequence: number;
  type: "action" | "snapshot";
  snapshot: SimulationSnapshot;
  action?: ActionRecord;
}>;
export type SupportedAction = Readonly<{
  action: "move-weight";
  stationId: "balance";
  objectIds: readonly ["left-weight", "right-weight"];
  botIds: readonly ["pip", "nova"];
  parameters: Readonly<{
    positionCm: Readonly<{ unit: "cm"; min: 5; max: 45 }>;
  }>;
  controller: "game-controlled";
}>;
export interface SimulationAdapter {
  getSupportedActions(): readonly SupportedAction[];
  getSnapshot(): SimulationSnapshot;
  submit(input: unknown): ActionSubmission;
  subscribe(listener: (event: SimulationEvent) => void): () => void;
  stop(): void;
  reset(): void;
}

export const BALANCE_FIXTURE = {
  room: { minX: -4.2, maxX: 4.2, minZ: -3.35, maxZ: 3.35 },
  station: {
    id: "balance",
    position: [0, 0, -0.5],
    footprint: [3.25, 1.2],
    topY: 0.85,
    pivot: [0, 1.34, -0.5],
    beamLength: 3,
    centimetersPerSceneMeter: 32,
  },
  walkway: { minX: -1.6, maxX: 1.65, minZ: 0.4, maxZ: 1.8 },
  botRadius: 0.35,
  speedMetersPerSecond: 0.8,
  dockMilliseconds: 300,
  operateMilliseconds: 600,
  bots: {
    pip: {
      spawn: [-1.2, 0, 1.2],
      waypoint: [-0.65, 0, 1.4],
      dock: [-0.65, 0, 0.8],
    },
    nova: {
      spawn: [1.25, 0, 1.4],
      waypoint: [0.65, 0, 1.4],
      dock: [0.65, 0, 0.8],
    },
  },
} as const;

export function createSimulationSnapshot(): SimulationSnapshot {
  return {
    contractVersion: 1,
    mode: "view-fixture",
    worldRevision: 0,
    resetGeneration: 0,
    world: createWorld(),
    bots: {
      pip: {
        id: "pip",
        position: [...BALANCE_FIXTURE.bots.pip.spawn],
        headingRad: Math.PI,
        status: "idle",
      },
      nova: {
        id: "nova",
        position: [...BALANCE_FIXTURE.bots.nova.spawn],
        headingRad: Math.PI,
        status: "idle",
      },
    },
    activeAction: null,
    lastAction: null,
    ownership: null,
  };
}
