import { describe, expect, it } from "vitest";
import { parseLocalTaskResult } from "./observation";
import { localBindingFixture, nativeIds, receiptTime, resultEnvelope } from "./test-fixtures";

describe("local normalization into the shared ObservationRun contract", () => {
  it("keeps Maps native ordinals, string identities, separate promotion, and original observation time", () => {
    const parsed = parseLocalTaskResult({
      data: resultEnvelope(),
      taskId: nativeIds[0],
      binding: localBindingFixture(),
      receivedAt: receiptTime,
    });
    const run = parsed.payload.runs[0];
    expect(run).toMatchObject({
      surface: "maps",
      provider: "dataforseo",
      completeness: "unknown",
      effectiveScope: null,
      configuredScope: {
        coordinates: { latitude: "52.2297000", longitude: "21.0122000" },
        zoom: 14,
        scopeClass: "coordinate_seed",
      },
      requestPolicy: {
        depth: 20,
        cutoff: 20,
        evidence: {
          observedAt: "2026-10-11T11:58:00.000Z",
          completeThrough: { map_listing: null },
        },
      },
    });
    expect(
      run.items.map((item) => [
        item.sourceOrdinal,
        item.rankGroup,
        item.rankAbsolute,
        item.promotion,
        item.rankScale,
      ]),
    ).toEqual([
      [0, 1, 1, "organic", "maps_organic"],
      [1, 1, 2, "promoted", null],
      [2, 3, 3, "organic", "maps_organic"],
    ]);
    expect(run.items[0].cid).toBe("9007199254740993123");
    expect(run.items[2].cid).toBe("9007199254740993124");
    expect(run.items[0].placeId).toBe("OpaquePlace_A");
    expect(
      run.items.every(
        (item) =>
          item.sourcePage === null && item.sourceBlockId === null && item.positionInBlock === null,
      ),
    ).toBe(true);
    expect(run.items[2].url).toBeNull();
    expect(parsed.observedAt).not.toBe(receiptTime.toISOString());
    expect(JSON.stringify(parsed.payload)).not.toContain("untrusted.invalid/private-url");
    expect(JSON.stringify(parsed.payload)).not.toContain("check_url");
    expect(JSON.stringify(parsed.payload)).not.toContain("se_results_count");
  });

  it("keeps Finder listing groups without inventing organic ranks or renumbering paid/unknown rows", () => {
    const result = parseLocalTaskResult({
      data: resultEnvelope("local_finder"),
      taskId: nativeIds[0],
      binding: localBindingFixture("local_finder"),
      receivedAt: receiptTime,
    });
    const items = result.payload.runs[0].items;
    expect(
      items.map((item) => [item.resultKind, item.rankGroup, item.promotion, item.rankScale]),
    ).toEqual([
      ["listing", 1, "organic", "finder_group"],
      ["listing", 2, "promoted", "finder_group"],
      ["listing", 3, "unknown", "finder_group"],
    ]);
    expect(items[0].placeId).toBeNull(); // Not documented for this Finder item kind.
    expect(result.payload.runs[0].requestPolicy.surface).toBe("local_finder");
  });

  it("scans identities over the full collection including unknown types and blocks unsafe numeric repair", () => {
    const envelope = resultEnvelope();
    const rawItems: unknown[] = envelope.tasks[0].result[0].items;
    rawItems.push({
      type: "unknown_future_item",
      rank_group: 9,
      rank_absolute: 9,
      cid: Number.MAX_SAFE_INTEGER + 2,
    });
    const payload = parseLocalTaskResult({
      data: envelope,
      taskId: nativeIds[0],
      binding: localBindingFixture(),
      receivedAt: receiptTime,
    }).payload;
    expect(payload.identityIssues).toEqual([
      {
        taskId: nativeIds[0],
        resultOrdinal: 0,
        sourceOrdinal: 3,
        field: "cid",
        reason: "unsafe_numeric_identifier",
      },
    ]);
    expect(payload.unsupportedItemCount).toBe(1);
    expect(payload.runs[0].items[2].sourceOrdinal).toBe(2);
    expect(payload.runs[0].items).toHaveLength(3);
  });

  it("keeps explicit invalid identities as blocking metadata rather than a weak-name rescue", () => {
    const envelope = resultEnvelope();
    const rawItem: Record<string, unknown> = envelope.tasks[0].result[0].items[0];
    rawItem.cid = 123;
    const parsed = parseLocalTaskResult({
      data: envelope,
      taskId: nativeIds[0],
      binding: localBindingFixture(),
      receivedAt: receiptTime,
    });
    expect(parsed.payload.runs[0].items[0].cid).toBeNull();
    expect(parsed.payload.identityIssues[0]).toMatchObject({
      sourceOrdinal: 0,
      field: "cid",
      reason: "invalid_identifier",
    });
    expect(parsed.payload.runs[0].items[0].rawFragment).toMatchObject({
      cid: 123,
      identityIssues: [{ reason: "invalid_identifier" }],
    });
  });

  it("treats request depth/count/echo and missing or malformed timestamps as unknown evidence", () => {
    const envelope = resultEnvelope();
    envelope.tasks[0].result[0].datetime = "2026-02-30 10:00:00 +00:00";
    const parsed = parseLocalTaskResult({
      data: envelope,
      taskId: nativeIds[0],
      binding: localBindingFixture(),
      receivedAt: receiptTime,
    });
    expect(parsed.observedAt).toBeNull();
    expect(parsed.payload.runs[0].requestPolicy.evidence?.observedAt).toBeNull();
    expect(parsed.payload.runs[0].items[0].observedAt).toBeNull();
    expect(parsed.payload.runs[0].completeness).toBe("unknown");
    expect(parsed.payload.runs[0].effectiveScope).toBeNull();
  });

  it("refuses wrong-task, pending, and wrong-surface results without using another task's data", () => {
    expect(() =>
      parseLocalTaskResult({
        data: resultEnvelope(),
        taskId: nativeIds[1],
        binding: localBindingFixture(),
        receivedAt: receiptTime,
      }),
    ).toThrow("accepted task");
    expect(() =>
      parseLocalTaskResult({
        data: { status_code: 20000, tasks: [{ id: nativeIds[0], status_code: 20100 }] },
        taskId: nativeIds[0],
        binding: localBindingFixture(),
        receivedAt: receiptTime,
      }),
    ).toThrow();
    expect(() =>
      parseLocalTaskResult({
        data: resultEnvelope("local_finder"),
        taskId: nativeIds[0],
        binding: localBindingFixture(),
        receivedAt: receiptTime,
      }),
    ).toThrow("Unsupported local result shape");
  });
});
