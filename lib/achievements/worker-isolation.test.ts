import { expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ query: vi.fn(), intent: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: m.query } }));
vi.mock("@/lib/achievements/process", () => ({ hasAchievementIntent: m.intent }));
vi.mock("@/lib/local-monitor-recurring/config", () => ({ recurringMonitorsEnabled: () => false }));

import { hasPendingWorkerIntent } from "@/lib/worker-intents/pending-probe";

it("does not make the shared probe unavailable when achievements storage is missing", async () => {
  m.query.mockResolvedValue([{ pending: false }]);
  m.intent.mockRejectedValue(new Error("table unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await hasPendingWorkerIntent()).toBe(false);
  } finally {
    log.mockRestore();
  }
});
