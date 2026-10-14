import { buildMonitorDefinition } from "@/lib/local-monitor-store/definition";
import { monitorDefinitionFixture, monitorKeywordFixture } from "@/lib/local-monitor-store/fixture";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { localKeywordRevision } from "@/lib/local-monitoring-store/canonical";
import { describe, expect, it } from "vitest";
import { readRetainedMonitorDefinition } from "./source-definition";

describe("retained monitor keyword epoch pair authority", () => {
  function fixture() {
    return buildMonitorDefinition(monitorDefinitionFixture, {
      entityId: "entity_a",
      revisionId: "definition-r1",
      keywords: [
        {
          ...monitorKeywordFixture,
          measurementTargetEpoch: "9007199254740993123",
          measurementPolicyEpoch: "9007199254740993987",
        },
      ],
    });
  }
  it("preserves both lossless captured scalars and derives the opaque original target key", () => {
    const retained = readRetainedMonitorDefinition(fixture());
    const keyword = retained.keywords[0];
    expect(localKeywordRevision(keyword)).toBe("9007199254740993123:9007199254740993987");
    const target = {
      version: 1 as const,
      projectId: "synthetic-project",
      keywordId: keyword.id,
      keywordRevision: localKeywordRevision(keyword),
      pointRevision: retained.grid.points[0].point.revisionKey,
      policyRevision: retained.grid.revisionId,
      ...retained.axes,
    };
    expect(executionTargetKey(target)).not.toBe(
      executionTargetKey({ ...target, keywordRevision: keyword.measurementTargetEpoch }),
    );
    expect(retained).toEqual(fixture());
  });
  it.each(["measurementTargetEpoch", "measurementPolicyEpoch"] as const)(
    "rejects absent/null/noncanonical %s instead of inventing a revision",
    (field) => {
      for (const value of [undefined, null, "01", "-1", "1e3", 1]) {
        const original = fixture();
        expect(() =>
          readRetainedMonitorDefinition({
            ...original,
            keywords: [{ ...original.keywords[0], [field]: value }],
          }),
        ).toThrow();
      }
    },
  );
  it("rejects the old nonexistent keyword epoch alias without rewriting captured evidence", () => {
    const original = fixture();
    const { measurementTargetEpoch, measurementPolicyEpoch, ...keyword } = original.keywords[0];
    expect(() =>
      readRetainedMonitorDefinition({
        ...original,
        keywords: [
          {
            ...keyword,
            measurementEpoch: localKeywordRevision({
              measurementTargetEpoch,
              measurementPolicyEpoch,
            }),
          },
        ],
      }),
    ).toThrow();
  });
});
