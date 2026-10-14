import { describe, expect, it } from "vitest";
import { localSelectionFixture } from "./fixtures";
import { freezeGridSelection } from "./grid-selection";
import { legacyKeywordOwner } from "./legacy-owner";
import { executionTargetKey, operationKey, projectionKey } from "./target-key";
import { targetOperationScope } from "./target-operation";

describe("separate execution, projection and legacy identity", () => {
  it("includes every execution scope axis and validates rank scales", () => {
    const target = localSelectionFixture(1).targets[0];
    const key = executionTargetKey(target);
    const changes = [
      { projectId: "other" },
      { keywordRevision: "v2" },
      { pointRevision: "point-v2" },
      { language: "pl" },
      { device: "mobile" as const },
      { operatingSystem: "android" },
      { cutoff: 10 },
      { zoom: 13 },
      { policyRevision: "v2" },
    ];
    for (const change of changes)
      expect(executionTargetKey({ ...target, ...change })).not.toBe(key);
    expect(() => executionTargetKey({ ...target, surface: "local_finder" })).toThrow();
    expect(
      executionTargetKey({
        ...target,
        surface: "local_finder",
        resultKind: "listing",
        rankScale: "finder_organic",
      }),
    ).not.toBe(key);
    expect(() => executionTargetKey({ ...target, cutoff: 0 })).toThrow();
  });
  it("changes entity/matcher projection without changing the bought execution", () => {
    const executionKey = executionTargetKey(localSelectionFixture(1).targets[0]);
    const projection = {
      version: 1 as const,
      executionTargetKey: executionKey,
      entityRevision: "entity-1",
      matcherVersion: "matcher-1",
      normalizationVersion: "normalization-1",
    };
    expect(projectionKey(projection)).not.toBe(
      projectionKey({ ...projection, entityRevision: "entity-2" }),
    );
    expect(projectionKey(projection)).not.toBe(
      projectionKey({ ...projection, matcherVersion: "matcher-2" }),
    );
    expect(projection.executionTargetKey).toBe(executionKey);
  });
  it("retains the real legacy lease/workflow protocol without creating point checks", () => {
    expect(legacyKeywordOwner("project-a", "keyword-a")).toMatchObject({
      kind: "legacy_keyword",
      runningLeaseKeywordId: "keyword-a",
      workflowId: "rank-check-keyword-a",
    });
    expect(legacyKeywordOwner("project-a", "keyword-a").targetKey).not.toBe(
      legacyKeywordOwner("project-b", "keyword-a").targetKey,
    );
  });
  it("freezes full point population and stable child operation scope", () => {
    const { grid, targets, selection } = localSelectionFixture(3);
    expect(Object.isFrozen(selection.targets[0])).toBe(true);
    expect(freezeGridSelection(grid, [...targets].reverse())).toEqual(selection);
    expect(() => freezeGridSelection(grid, targets.slice(1))).toThrow();
    expect(() =>
      freezeGridSelection(
        grid,
        targets.map((target, index) => (index === 0 ? { ...target, zoom: 12 } : target)),
      ),
    ).toThrow();
    const scan = {
      projectId: targets[0].projectId,
      operation: "local_scan_submit" as const,
      idempotencyKey: "scan-1",
    };
    expect(operationKey(targetOperationScope(scan, targets[0]))).not.toBe(
      operationKey(targetOperationScope(scan, targets[1])),
    );
    expect(targetOperationScope(scan, targets[0])).toEqual(targetOperationScope(scan, targets[0]));
    expect(operationKey({ ...scan, projectId: "other" })).not.toBe(operationKey(scan));
  });
});
