import { loadByokEvidence, persistByokEvidence } from "@/lib/provider-usage/byok-evidence-storage";
import { describe, expect, it } from "vitest";
import { binding, measuredResult, reportedResult } from "./usage.test-support";
import {
  bindModelUsageEvidence,
  loadModelUsageEvidence,
  persistModelUsageEvidence,
} from "./usage-storage";
import { usageStorageHarness } from "./usage-storage.test-support";

const f = usageStorageHarness();
async function bind() {
  await bindModelUsageEvidence(f.tx, "attempt-1", binding());
}

describe("retained native usage evidence in offline PGlite", () => {
  it.each(["projectId", "principal", "source", "connectionId", "credentialVersion"] as const)(
    "rejects a mismatched pre-dispatch %s",
    async (field) => {
      const wrong = {
        ...binding(),
        [field]:
          field === "source" ? "api" : field === "credentialVersion" ? "b".repeat(64) : "other",
      };
      await expect(bindModelUsageEvidence(f.tx, "attempt-1", wrong)).rejects.toThrow(
        "Native evidence does not match the retained attempt.",
      );
      expect((await f.find("attempt-1"))?.receipt).toBeNull();
    },
  );
  it("persists complete tokens with unavailable money and reads only the owning project", async () => {
    await bind();
    await persistModelUsageEvidence(f.tx, "attempt-1", measuredResult());
    expect(await f.find("attempt-1")).toMatchObject({
      measurementStatus: "native_complete",
      proofVersion: 2,
    });
    expect(
      (await loadModelUsageEvidence(f.tx, "attempt-1", binding().projectId))?.receipt?.monetary
        .status,
    ).toBe("unavailable");
    expect(await loadModelUsageEvidence(f.tx, "attempt-1", "other-project")).toBeNull();
    expect(await loadByokEvidence(f.tx, "attempt-1")).toBeNull();
  });
  it("retains missing post-dispatch evidence as unknown without inventing a retry", async () => {
    await bind();
    await persistModelUsageEvidence(f.tx, "attempt-1", null);
    expect(await f.find("attempt-1")).toMatchObject({ measurementStatus: "unknown" });
    expect(
      (await loadModelUsageEvidence(f.tx, "attempt-1", binding().projectId))?.receipt?.usageStatus,
    ).toBe("unknown");
    await persistModelUsageEvidence(f.tx, "attempt-1", measuredResult());
    expect(await f.find("attempt-1")).toMatchObject({
      proofVersion: 2,
      measurementStatus: "native_complete",
    });
  });
  it("deduplicates identical settlement and two columns sharing one native request without zero cost", async () => {
    await bind();
    await persistModelUsageEvidence(f.tx, "attempt-1", reportedResult());
    expect(await persistModelUsageEvidence(f.tx, "attempt-1", reportedResult())).toMatchObject({
      changed: false,
    });
    expect(await f.find("attempt-1")).toMatchObject({ proofVersion: 2 });
    await f.seed("attempt-2");
    await bindModelUsageEvidence(f.tx, "attempt-2", { ...binding(), attemptId: "attempt-2" });
    const replay = reportedResult();
    replay.finishedAt = "2026-11-11T12:01:00Z";
    expect(await persistModelUsageEvidence(f.tx, "attempt-2", replay)).toMatchObject({
      canonicalId: "attempt-1",
    });
    expect(await loadModelUsageEvidence(f.tx, "attempt-2", binding().projectId)).toMatchObject({
      counted: false,
      receipt: { monetary: { total: { amount: "0.00012345" } } },
    });
  });
  it("retains native evidence if saving the answer subsequently fails", async () => {
    await bind();
    await f.db.exec("CREATE TABLE retained_answers(answer text NOT NULL)");
    // A shared transaction necessarily rolls proof back with the answer.
    await expect(
      f.transaction(async (tx) => {
        await persistModelUsageEvidence(tx, "attempt-1", measuredResult());
        await tx.$queryRaw`INSERT INTO retained_answers VALUES(NULL)`;
      }),
    ).rejects.toThrow('null value in column "answer"');
    expect(
      (await loadModelUsageEvidence(f.tx, "attempt-1", binding().projectId))?.receipt?.evidence,
    ).toBeNull();
    // P09b must commit evidence before its independent answer transaction.
    await f.transaction((tx) => persistModelUsageEvidence(tx, "attempt-1", measuredResult()));
    await expect(
      f.db.transaction((tx) => tx.query("INSERT INTO retained_answers VALUES(NULL)")),
    ).rejects.toThrow('null value in column "answer"');
    const retained = await loadModelUsageEvidence(f.tx, "attempt-1", binding().projectId);
    expect(retained?.receipt?.usageStatus).toBe("complete");
    expect(JSON.stringify(retained)).not.toContain("An answer with two citations");
  });
  it.each([false, true])(
    "serializes two transactional settlers with distinct attempts = %s",
    async (distinct) => {
      await bind();
      if (distinct) {
        await f.seed("attempt-2");
        await f.transaction((tx) =>
          bindModelUsageEvidence(tx, "attempt-2", { ...binding(), attemptId: "attempt-2" }),
        );
      }
      const transactionIds: unknown[] = [];
      const results = await Promise.all(
        ["attempt-1", distinct ? "attempt-2" : "attempt-1"].map((id) =>
          f.transaction(async (tx) => {
            transactionIds.push(await tx.$queryRaw`SELECT txid_current()::text AS id`);
            return persistModelUsageEvidence(tx, id, reportedResult());
          }),
        ),
      );
      expect(transactionIds[0]).not.toEqual(transactionIds[1]);
      expect(results.filter((result) => result.changed)).toHaveLength(distinct ? 2 : 1);
      expect(await f.find("attempt-1")).toMatchObject({ canonicalId: null, proofVersion: 2 });
      if (distinct)
        expect(await f.find("attempt-2")).toMatchObject({
          canonicalId: "attempt-1",
          proofVersion: 2,
        });
    },
  );
  it("rejects changed money, model, source and credential bindings without replacing proof", async () => {
    await bind();
    await persistModelUsageEvidence(f.tx, "attempt-1", reportedResult());
    await expect(persistModelUsageEvidence(f.tx, "attempt-1", reportedResult("9"))).rejects.toThrow(
      "Native usage proof is immutable; reconciliation requires an explicit correction.",
    );
    for (const changed of [
      { ...binding(), source: "api" as const },
      { ...binding(), credentialVersion: "b".repeat(64) },
      { ...binding(), column: { ...binding().column, modelId: "other-model" } },
    ])
      await expect(bindModelUsageEvidence(f.tx, "attempt-1", changed)).rejects.toThrow(
        changed.column.modelId !== binding().column.modelId
          ? "Native usage binding is immutable."
          : "Native evidence does not match the retained attempt.",
      );
    expect(await f.find("attempt-1")).toMatchObject({ proofVersion: 2 });
  });
  it("refuses new-entry payloads on a legacy feature and legacy receipts on native entries", async () => {
    await f.seed("legacy", { feature: "rank_check", provider: "dataforseo" });
    await expect(
      bindModelUsageEvidence(f.tx, "legacy", { ...binding(), attemptId: "legacy" }),
    ).rejects.toThrow("Native evidence does not match the retained attempt.");
    await expect(
      persistByokEvidence(
        f.tx,
        "attempt-1",
        { cached: false, costCents: 0, quantity: 1, failed: false },
        null,
      ),
    ).rejects.toThrow("Native models require versioned usage evidence.");
  });
});
