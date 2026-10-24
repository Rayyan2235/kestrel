import {
  type ActionRequest,
  type BotId,
  type SimulationAdapter,
} from "@kestrel/contracts";

/** A local fixture sender for integration development; no provider or audio access. */
export function createMockSender(
  adapter: SimulationAdapter,
  botId: BotId,
  requestPrefix: string,
) {
  let sequence = 0;
  return {
    prepareMove(side: "left" | "right", positionCm: number): ActionRequest {
      const snapshot = adapter.getSnapshot();
      return {
        requestId: `${requestPrefix}-${++sequence}`,
        botId,
        worldRevision: snapshot.worldRevision,
        resetGeneration: snapshot.resetGeneration,
        action: "move-weight",
        stationId: "balance",
        objectId: side === "left" ? "left-weight" : "right-weight",
        parameters: { positionCm },
      };
    },
    send: (request: ActionRequest) => adapter.submit(request),
  };
}
