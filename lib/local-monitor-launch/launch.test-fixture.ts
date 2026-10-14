import type { MonitorLaunchCommand } from "./contracts";
export const now = new Date("2026-10-12T12:00:00.000Z");
export const command: MonitorLaunchCommand = {
  projectId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
  monitorId: "lmn_aaaaaaaaaaaaaaaaaaaaaaaa",
  expectedVersion: 0,
  connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
  idempotencyKey: "key",
  revisionId: "revision",
  scheduleIntentId: "intent",
  consentToken: "token",
  targetIds: ["lmt_aaaaaaaaaaaaaaaaaaaaaaaa"],
  quote: {
    version: 1,
    projectId: "db-project",
    expectedTargetKeys: ["key"],
    effectiveOptions: {},
    capabilityVersion: "cap",
    provider: "provider",
    adapterVersion: "adapter",
    providerPriceVersion: "price",
    nativeEstimates: [{ unit: "USD", amount: "0.01" }],
    issuedAt: now.toISOString(),
    expiresAt: "2026-10-12T12:05:00.000Z",
  },
};
