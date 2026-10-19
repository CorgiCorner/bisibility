import { existsSync } from "node:fs";
import path from "node:path";
import { PROVIDER_REQUEST_FEATURES } from "@/lib/provider-usage/request-features";
import { describe, expect, it } from "vitest";
import { estimateOnlyScope } from "./estimate-only-scope";
import { getOpenApiDocument } from "./openapi";
import {
  deferredSpendAnchors,
  nonApiProviderFeatures,
  type OperationProviderSpend,
  operationProviderFree,
  operationProviderSpend,
} from "./operation-provider-spend";
import {
  billedRequestSites,
  importGraph,
  repositoryRoot,
} from "./operation-provider-spend.test-support";
import { deploymentFreeOperationProviderSpend } from "./operation-provider-spend-extension";

const entries = Object.entries(operationProviderSpend) as [string, OperationProviderSpend][];
const operationIds = Object.values(getOpenApiDocument().paths).flatMap((item) =>
  Object.values(item as Record<string, { operationId?: string }>).map(
    (operation) => operation.operationId,
  ),
);
const graph = importGraph();
const billed = billedRequestSites(graph.sources);

describe("operation provider spend registry", () => {
  it("keeps explicit free classifications documented and separate from paid operations", () => {
    for (const [id, entry] of Object.entries(operationProviderFree)) {
      expect(operationProviderSpend).not.toHaveProperty(id);
      expect(existsSync(path.join(repositoryRoot, entry.handler)), entry.handler).toBe(true);
      if (id in deploymentFreeOperationProviderSpend) continue;
      expect(operationIds).toContain(id);
      const operation = Object.values(getOpenApiDocument().paths)
        .flatMap((item) =>
          Object.values(
            item as Record<string, { operationId?: string; "x-bisibility-cost"?: object }>,
          ),
        )
        .find((candidate) => candidate.operationId === id);
      expect(operation?.["x-bisibility-cost"]).toEqual({ kind: "free" });
    }
  });

  it("lists only documented operations", () => {
    expect(entries.map(([id]) => id).filter((id) => !operationIds.includes(id))).toEqual([]);
  });

  it("claims every provider-billed feature once through an operation or as app-only", () => {
    const claimed = new Set(entries.flatMap(([, spend]) => spend.features));
    const unclaimed = PROVIDER_REQUEST_FEATURES.filter(
      (feature) => !claimed.has(feature) && !nonApiProviderFeatures.includes(feature),
    );
    expect(unclaimed).toEqual([]);
    expect(nonApiProviderFeatures.filter((feature) => claimed.has(feature))).toEqual([]);
  });

  it("finds the billed-request sites it checks handlers against", () => {
    expect(billed.length).toBeGreaterThan(0);
    for (const anchors of Object.values(deferredSpendAnchors)) {
      for (const anchor of anchors ?? [])
        expect(existsSync(path.join(repositoryRoot, anchor))).toBe(true);
    }
  });

  it.each(entries)("%s: its handler reaches the code that bills or queues it", (_id, spend) => {
    expect(existsSync(path.join(repositoryRoot, spend.handler)), spend.handler).toBe(true);
    const reached = graph.reachable(spend.handler);
    if (spend.timing === "inline") {
      expect(
        billed.filter((site) => reached.has(site)),
        spend.handler,
      ).not.toEqual([]);
      return;
    }
    for (const feature of spend.features) {
      const anchors = deferredSpendAnchors[feature] ?? [];
      expect(
        anchors.filter((anchor) => reached.has(anchor)),
        `${feature}`,
      ).not.toEqual([]);
    }
  });

  it("gives every estimate-only operation of the router an estimate in the registry", () => {
    const url = new URL("https://example.com/api/v1/x?estimate_only=true");
    const downgraded = operationIds.filter(
      (operationId) =>
        operationId &&
        estimateOnlyScope({
          operationId,
          parsedBody: { estimate_only: true },
          requiredScope: "write",
          url,
        }) === "read",
    );
    const withEstimate = entries.filter(([, spend]) => spend.estimate).map(([id]) => id);
    expect(downgraded.filter((id) => !withEstimate.includes(id as string))).toEqual([]);
  });
});
