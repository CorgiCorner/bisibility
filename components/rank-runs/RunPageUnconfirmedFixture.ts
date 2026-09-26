import { runPageFixture } from "./RunPageFixtures";
import type { RunPageInitialData } from "./RunPageTypes";

export const unconfirmedRunFixture: RunPageInitialData = {
  ...runPageFixture,
  nextCursor: null,
  run: {
    ...runPageFixture.run,
    counts: {
      cancelled: 0,
      completed: 0,
      deferred: 0,
      failed: 0,
      requested: 2,
      skipped: 2,
      total: 2,
    },
    costCents: 0,
    estimatedCostCents: 4,
    finishedAt: "2026-08-31T14:20:08.000Z",
    keywordCount: 2,
    outcome: "failed",
    provider: "serpapi",
    providerLabel: "SerpApi",
    startedTargets: 2,
    status: "completed",
    targetCount: 2,
    usage: { actual: null, estimated: 4, unit: "operations" },
  },
  items: runPageFixture.items.slice(0, 2).map((item) => ({
    ...item,
    actualCostCents: null,
    blockedReason: "send_unconfirmed",
    estimatedCostCents: 2,
    finishedAt: "2026-08-31T14:20:08.000Z",
    rankCheck: {
      billingUnits: null,
      errorCode: null,
      position: null,
      provider: "serpapi",
      publicId: `check_${item.id}`,
      rankingUrl: null,
      requestedDepth: 20,
    },
    startedAt: "2026-08-31T14:20:00.000Z",
    status: "blocked",
  })),
};
