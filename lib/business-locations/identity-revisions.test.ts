import { describe, expect, it } from "vitest";
import { planIdentityRevision, requireExplicitSubject } from "./identity-revisions";
import { cidA, location, projectId, revision, writeContext } from "./test-fixtures";

const plan = (overrides: Partial<Parameters<typeof planIdentityRevision>[0]> = {}) =>
  planIdentityRevision({
    id: "entity_a_revision_2",
    entityId: "entity_a",
    projectId,
    current: revision(),
    expectedRevision: 1,
    patch: { name: "Żółw Firma - new label" },
    activeLocations: [location()],
    context: writeContext,
    effectiveFrom: "2026-10-02T10:00:00.000Z",
    reason: "Update identity snapshot",
    idempotencyKey: "operation_1",
    ...overrides,
  });

describe("immutable identity revision plans", () => {
  it("preserves optional address, coordinates, Maps URL and opaque IDs when not patched", () => {
    const current = revision(),
      before = structuredClone(current);
    const { revision: next, audit } = plan({
      current,
      patch: { name: "New label", address: undefined },
    });
    expect(next).toMatchObject({ revision: 2, previousRevisionId: current.id });
    expect(next.snapshot).toMatchObject({
      address: current.snapshot.address,
      coordinates: current.snapshot.coordinates,
      mapsUrl: current.snapshot.mapsUrl,
      identifiers: current.snapshot.identifiers,
    });
    expect(next.snapshot.identifiers[0].value).toBe(cidA);
    expect(current).toEqual(before);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.snapshot.coordinates)).toBe(true);
    expect(Object.isFrozen(next.snapshot.identifiers[0].provenance)).toBe(true);
    expect(audit).toMatchObject({
      actorId: writeContext.actorId,
      revisionId: next.id,
      previousId: current.id,
      idempotencyKey: "operation_1",
    });
    expect(audit).not.toHaveProperty("address");
  });
  it("supports an explicitly unverified new location without fabricating identifiers", () => {
    const result = plan({
      current: null,
      expectedRevision: 0,
      id: "entity_a_revision_1",
      patch: { name: "Unverified" },
      activeLocations: [],
    });
    expect(result.revision.snapshot.identifiers).toEqual([]);
    expect(result.revision.previousRevisionId).toBeNull();
  });
  it("treats explicit null metadata as removal in a new snapshot while retaining the old snapshot", () => {
    expect(
      plan({ patch: { address: null, coordinates: null, mapsUrl: null } }).revision.snapshot,
    ).toMatchObject({ address: null, coordinates: null, mapsUrl: null });
    expect(revision().snapshot.address).toBe("Synthetic branch address");
  });
  it("refuses stale revision, foreign scope, reused revision ID and backwards effective date", () => {
    expect(() => plan({ expectedRevision: 0 })).toThrow("revision conflict");
    expect(() => plan({ current: { ...revision(), projectId: "foreign" } })).toThrow(
      "scope conflict",
    );
    expect(() => plan({ id: revision().id })).toThrow("scope conflict");
    expect(() => plan({ effectiveFrom: "2026-09-30T10:00:00.000Z" })).toThrow("predecessor");
  });
  it("blocks duplicate active strong IDs within a project but permits the same public company in another project", () => {
    expect(() => plan({ activeLocations: [location(revision("entity_b", cidA))] })).toThrow(
      "already owns",
    );
    const other = revision("entity_b", cidA);
    expect(() =>
      plan({ activeLocations: [location({ ...other, projectId: "other_project" })] }),
    ).not.toThrow();
  });
  it.each([
    { ...writeContext, canWrite: false },
    { ...writeContext, writeMode: "read_only" as const },
    { ...writeContext, projectId: "foreign" },
  ])("requires a trusted writable same-project context", (context) => {
    expect(() => plan({ context })).toThrow("not authorized");
  });
});

describe("explicit subject", () => {
  it("requires the selected active subject and exact current revision, never the first location", () => {
    const a = location(),
      b = location(revision("entity_b", "123"));
    expect(
      requireExplicitSubject([b, a], {
        projectId,
        entityId: a.id,
        identityRevisionId: a.currentRevision.id,
      }),
    ).toEqual(a.currentRevision);
    expect(() =>
      requireExplicitSubject([a], {
        projectId,
        entityId: "missing",
        identityRevisionId: a.currentRevision.id,
      }),
    ).toThrow("explicit");
    expect(() =>
      requireExplicitSubject([{ ...a, role: "competitor" }], {
        projectId,
        entityId: a.id,
        identityRevisionId: a.currentRevision.id,
      }),
    ).toThrow("subject");
    expect(() =>
      requireExplicitSubject([{ ...a, state: "archived" }], {
        projectId,
        entityId: a.id,
        identityRevisionId: a.currentRevision.id,
      }),
    ).toThrow("subject");
    expect(() =>
      requireExplicitSubject([a], {
        projectId,
        entityId: a.id,
        identityRevisionId: "old_revision",
      }),
    ).toThrow("revision conflict");
    expect(() =>
      requireExplicitSubject(
        [{ ...a, currentRevision: { ...a.currentRevision, projectId: "foreign" } }],
        { projectId, entityId: a.id, identityRevisionId: a.currentRevision.id },
      ),
    ).toThrow("scope conflict");
  });
});
