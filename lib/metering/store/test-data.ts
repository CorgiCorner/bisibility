import type { Budget, Operation, Receipt, ReserveInput } from "@usagekit/core";
export const request = (operationId = crypto.randomUUID()): ReserveInput => ({
  operationId,
  scope: { namespace: "test", principal: "u1", connection: "c1" },
  fundingSource: "byok",
  costOwner: "u1",
  surface: "app",
  source: "app",
  provider: "search",
  operation: "search",
  estimate: [{ unit: "requests", value: 1n, scale: 0 }],
});
export const bound = (version = 1): Budget => ({
  id: "one-slot",
  version,
  scope: { kind: "principal", namespace: "test", principal: "u1" },
  surface: "any",
  unit: "requests",
  limit: { unit: "requests", value: 1n, scale: 0 },
  onExceed: "block",
  window: { kind: "since_reset", epoch: `epoch-${version}`, startsAt: "2026-09-01T00:00:00.000Z" },
});
export const ref = (input: ReserveInput) => ({
  namespace: input.scope.namespace,
  principal: input.scope.principal,
  operationId: input.operationId,
});
export const command = (op: Operation) => ({
  ...ref(op),
  expectedVersion: op.version,
  commandId: crypto.randomUUID(),
});
export const receipt = (): Receipt => ({
  id: crypto.randomUUID(),
  measurements: [
    {
      unit: "requests",
      quantity: { unit: "requests", value: 1n, scale: 0 },
      certainty: "measured",
    },
  ],
  cost: { certainty: "measured", money: { units: 1n, currency: "USD" } },
  cached: false,
  failed: false,
  occurredAt: "2026-09-23T12:00:00.000Z",
  recordedAt: "2026-09-23T12:00:00.000Z",
});
