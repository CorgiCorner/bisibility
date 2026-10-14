import { businessDigest } from "@/lib/business-location-store/canonical";
import { storedMatch } from "@/lib/business-location-store/match-repository";
import { projectRetainedBusinessObservation } from "@/lib/business-location-store/observation-read";
import type {
  BusinessIdentityRevision,
  BusinessMatchDecision,
  BusinessMatchHead,
  Prisma,
} from "@/lib/generated/prisma/client";
import { localResultFixture, resultObservation } from "@/lib/local-monitor-results/fixture";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retainMapsCollectionMatch } from "./maps-match";

const mocked = vi.hoisted(() => ({
  definition: vi.fn(),
  retained: vi.fn(),
  registry: vi.fn(),
  identity: vi.fn(),
}));
vi.mock("@/lib/local-monitoring-store/occurrence-definition", () => ({
  readOccurrenceDefinition: mocked.definition,
}));
vi.mock("@/lib/business-location-store/location-repository", () => ({
  loadProjectLocations: mocked.registry,
  storedIdentity: mocked.identity,
}));
vi.mock("@/lib/business-location-store/observation-read", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/business-location-store/observation-read")>();
  return { ...original, loadRetainedBusinessObservation: mocked.retained };
});
describe("trusted Maps collection match capture and immutable replay", () => {
  beforeEach(() => vi.clearAllMocks());
  function setup() {
    const { binding, now } = localResultFixture(),
      row = binding.rows[0],
      saved = resultObservation(row),
      retained = projectRetainedBusinessObservation(saved.observation),
      heads: BusinessMatchHead[] = [],
      decisions: BusinessMatchDecision[] = [];
    const tx = {
      observationRun: { findFirst: vi.fn(async () => saved.observation) },
      businessLocation: { count: vi.fn(async () => 1) },
      businessIdentityRevision: {
        findFirst: vi.fn(async () => ({ id: binding.definition.identityRevisionId })),
      },
      businessMatchHead: {
        count: vi.fn(async () => heads.length),
        findMany: vi.fn(async () => heads),
        create: vi.fn(
          async ({
            data,
          }: {
            data: Omit<BusinessMatchHead, "id" | "version" | "currentDecisionId">;
          }) => {
            const value = {
              ...data,
              id: `head-${data.itemId}`,
              version: 0,
              currentDecisionId: null,
            };
            heads.push(value);
            return value;
          },
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: { currentDecisionId: string };
          }) => {
            const head = heads.find(
              (value) => value.id === where.id && value.version === where.version,
            );
            if (!head) return { count: 0 };
            head.version++;
            head.currentDecisionId = data.currentDecisionId;
            return { count: 1 };
          },
        ),
      },
      businessMatchDecision: {
        count: vi.fn(async () => decisions.length),
        findMany: vi.fn(async () => decisions),
        create: vi.fn(async ({ data }: { data: BusinessMatchDecision }) => {
          decisions.push(data);
          return data;
        }),
      },
    };
    mocked.definition.mockResolvedValue(binding);
    mocked.retained.mockResolvedValue(retained);
    const identity = {
      id: binding.definition.identityRevisionId,
      entityId: binding.definition.entityId,
      projectId: row.item.projectId,
      revision: 1,
      previousRevisionId: null,
      effectiveFrom: "2026-10-12T11:00:00.000Z",
      normalizerVersion: "business-identity-v1",
      actorId: null,
      reason: "Captured",
      snapshot: {
        name: "Synthetic business",
        identifiers: [
          {
            namespace: "google_business",
            engine: "google",
            type: "cid",
            value: "9007199254740993123",
            provenance: {
              source: "user",
              referenceId: null,
              recordedAt: "2026-10-12T11:00:00.000Z",
            },
          },
        ],
      },
    };
    mocked.identity.mockReturnValue(identity);
    mocked.registry.mockResolvedValue([{ id: identity.entityId, currentRevision: identity }]);
    const input = {
      tx: tx as unknown as LocalTransaction,
      item: row.item,
      record: row.record,
      observationId: saved.observation.id,
      target: row.target,
      point: row.point,
      replay: false,
      now,
    };
    return { input, tx, heads, decisions, retained, identity };
  }
  it("stores full original decisions with captured revision and native Maps group proof", async () => {
    const f = setup();
    await retainMapsCollectionMatch(f.input);
    expect(f.decisions).toHaveLength(3);
    expect(storedMatch(f.decisions[0])).toMatchObject({
      identityRevisionId: f.identity.id,
      source: "automatic",
      status: "confirmed",
      organicEligible: true,
      originalOrdinals: { group: 1, slot: null },
    });
    expect(f.tx.businessIdentityRevision.findFirst).toHaveBeenCalledWith({
      where: {
        projectId: f.input.item.projectId,
        entityId: f.identity.entityId,
        id: f.identity.id,
      },
    });
    const source = f.retained.sourceByItem.get(f.decisions[0].itemId);
    expect(storedMatch(f.decisions[0]).observationSource).toEqual(source);
    await retainMapsCollectionMatch({ ...f.input, replay: true });
    expect(f.decisions).toHaveLength(3);
    expect(mocked.registry).toHaveBeenCalledTimes(1);
  });
  it("replay verifies original authority even after an explicit current rematch, without rematching registry", async () => {
    const f = setup();
    await retainMapsCollectionMatch(f.input);
    const original = f.decisions[0];
    f.decisions.push({
      ...original,
      id: "manual-rematch",
      decisionRevision: 2,
      previousDecisionId: original.id,
    });
    f.tx.businessMatchDecision.findMany.mockImplementation(async (args?: unknown) => {
      if (args && typeof args === "object" && "where" in args) {
        const where = args.where;
        if (where && typeof where === "object" && "decisionRevision" in where)
          return f.decisions.filter((row) => row.decisionRevision === 1);
      }
      return f.decisions;
    });
    await retainMapsCollectionMatch({ ...f.input, replay: true });
    expect(mocked.registry).toHaveBeenCalledTimes(1);
  });
  it("missing original authority, changed source or CAS failure blocks collection", async () => {
    const f = setup();
    await expect(retainMapsCollectionMatch({ ...f.input, replay: true })).rejects.toThrow(
      "membership",
    );
    await retainMapsCollectionMatch(f.input);

    const original = await f.tx.observationRun.findFirst();
    f.tx.observationRun.findFirst.mockResolvedValue({
      ...original,
      items: [{ ...original.items[0], businessName: "Changed" }, ...original.items.slice(1)],
    });
    await expect(retainMapsCollectionMatch({ ...f.input, replay: true })).rejects.toThrow(
      "authority",
    );
    const other = setup();
    other.tx.businessMatchHead.updateMany.mockResolvedValue({ count: 0 });
    await expect(retainMapsCollectionMatch(other.input)).rejects.toThrow();
  });
});
