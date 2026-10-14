import { prisma } from "@/lib/db/prisma";
import { buildMonitorDefinition } from "@/lib/local-monitor-store/definition";
import { monitorDefinitionFixture, monitorKeywordFixture } from "@/lib/local-monitor-store/fixture";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalPolicyPort } from "@/lib/local-monitoring-store/context";
import { describe, expect, it, vi } from "vitest";
import { materializeMonitorTargets } from "./targets";

const f = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/local-monitoring-store/create-target", () => ({
  createLocalMeasurementTargetInTransaction: f.create,
}));
const scope: LocalProjectScope = {
  actor: { id: "actor", memberships: [] },
  project: { id: "project", publicId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa", writeMode: "active" },
  grant: { actorId: "actor", projectId: "project", role: "member" },
  context: { actor: null },
};
const policy: LocalPolicyPort = {
  capture: async () => ({ keywordRevision: "0", policyRevision: "revision" }),
  assertCurrent: async () => {},
};
describe("full keyword × point monitor selection", () => {
  it("materializes two keywords × nine canonical points as eighteen probes in the same transaction", async () => {
    const second = {
      ...monitorKeywordFixture,
      id: "second-keyword",
      publicId: "kw_bbbbbbbbbbbbbbbbbbbbbbbb",
    };
    const definition = buildMonitorDefinition(
      {
        ...monitorDefinitionFixture,
        keywordIds: [monitorKeywordFixture.publicId, second.publicId],
      },
      { entityId: "entity", keywords: [monitorKeywordFixture, second], revisionId: "revision" },
    );
    let id = 0;
    f.create.mockImplementation(async () => ({ id: `target-${++id}` }));
    const targets = await materializeMonitorTargets(prisma, scope, definition, policy);
    expect(targets).toHaveLength(18);
    expect(f.create).toHaveBeenCalledTimes(18);
    const pairs = f.create.mock.calls.map(([tx, actualScope, data, actualPolicy, point]) => {
      expect(tx).toBe(prisma);
      expect(actualScope).toBe(scope);
      expect(actualPolicy).toBe(policy);
      expect(data.latitude).toBe(point.coordinate.latitude);
      expect(data.longitude).toBe(point.coordinate.longitude);
      return `${data.keywordId}:${point.revisionId}`;
    });
    expect(new Set(pairs).size).toBe(18);
    for (const keyword of definition.keywords)
      expect(pairs.filter((pair) => pair.startsWith(`${keyword.publicId}:`))).toHaveLength(9);
  });
});
