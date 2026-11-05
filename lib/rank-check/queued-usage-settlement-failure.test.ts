import { byokTestJournal } from "@/lib/provider-usage/byok-test-journal";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { describe, expect, it, vi } from "vitest";
import { beginQueuedTaskUsageJournal, QueuedUsageSettlementError } from "./queued-usage-journal";

vi.mock("@/lib/provider-usage/admission-extension", async () => ({
  ownAdmission: (await import("@/lib/provider-usage/byok-test-evidence")).testOwnAdmission,
}));

function taskInput(index: number) {
  return {
    attribution: {
      context: {
        correlationId: `qtask_${index}`,
        feature: "rank_check" as const,
        projectId: "project_1",
        source: "app" as const,
        trigger: "scheduled" as const,
      },
      tag: `app=bisibility;stage=dev;src=app;trg=scheduled;f=rank_check;p=project_1;c=qtask_${index}`,
    } satisfies ProviderRequestAttribution,
    correlationId: `qtask_${index}`,
    keywordId: `keyword_${index}`,
  };
}

describe("queued usage settlement failures", () => {
  it("keeps deferred ids when an in-budget settle throws", async () => {
    const ledger = byokTestJournal("dataforseo");
    const journal = await beginQueuedTaskUsageJournal({
      client: ledger.db,
      connectionId: "connection_1",
      projectId: "project_1",
      tasks: [1, 2, 3].map((index) => taskInput(index)),
    });
    ledger.table.update.mockRejectedValueOnce(new Error("settle failed"));
    let remaining = 2;

    const error = await journal
      .settle(
        {
          accepted: [1, 2, 3].map((index) => ({
            correlationId: `qtask_${index}`,
            costCents: 1.2,
            providerTaskId: `provider_${index}`,
            tag: `t${index}`,
          })),
          failed: [],
          unknown: [],
        },
        { allowsAnother: () => remaining-- > 0 },
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(QueuedUsageSettlementError);
    expect(error).toMatchObject({ deferred: ["qtask_3"] });
    expect(ledger.rows.find((row) => row.correlationId === "qtask_2")).toEqual(
      expect.objectContaining({ measurementStatus: "recorded" }),
    );
    expect(ledger.rows.find((row) => row.correlationId === "qtask_3")).toEqual(
      expect.objectContaining({ measurementStatus: "unknown" }),
    );
  });
});
