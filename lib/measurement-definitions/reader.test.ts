import { describe, expect, it, vi } from "vitest";
import { definitionHeadFixture, definitionSourceFixture } from "./fixtures";
import type { DefinitionTransaction } from "./model";
import {
  readCurrentDefinitionsForVerifiedScope,
  readCurrentDefinitionsInTransaction,
} from "./reader";

vi.mock("server-only", () => ({}));

function fixture(
  source = definitionSourceFixture(),
  options: {
    installed?: boolean;
    head?: boolean;
    actorActive?: boolean;
    member?: boolean;
    intact?: boolean;
  } = {},
) {
  const head = definitionHeadFixture(source);
  const raw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes("FROM users")) return options.actorActive === false ? [] : [{ id: "reader" }];
    if (sql.includes("FROM memberships"))
      return options.member === false ? [] : [{ role: "viewer" }];
    if (sql.includes("AS tables"))
      return [
        {
          tables: options.installed === false ? 0 : 4,
          source: options.installed !== false,
          guard: options.installed !== false,
        },
      ];
    if (sql.includes("AS intact")) return [{ intact: options.intact !== false }];
    if (sql.includes('AS "hasHead"'))
      return [{ ...head, keywordId: source.keywordId, hasHead: options.head !== false, source }];
    if (sql.includes("AS source")) return [{ source }];
    throw new Error("Unexpected metadata SQL");
  });
  const execute = vi.fn();
  const tx = {
    $queryRaw: raw,
    $executeRaw: execute,
    project: {
      findUnique: vi.fn(async () => ({ id: source.projectId, publicId: source.projectPublicId })),
    },
    keyword: {
      findMany: vi.fn(async () => [{ id: source.keywordId, publicId: source.keywordPublicId }]),
    },
  } as unknown as DefinitionTransaction;
  return { tx, raw, execute, source, head };
}
// Real public IDs are supplied by a server adapter; avoid hard-coding a parser implementation in the fixture.
vi.mock("@/lib/db/public-id-resources", () => ({
  isPublicIdOfType: (id: string, prefix: string) => id.startsWith(`${prefix}_`),
}));
const freshness = { cadenceIntervalMs: vi.fn(async () => 123) };
const context = {
  actor: {
    id: "reader",
    role: "owner" as const,
    memberships: [{ projectId: "foreign", role: "owner" as const }],
  },
};
const asOf = new Date("2026-10-01T00:00:00Z");

describe("current definition authority reader", () => {
  it("does not project a later captured definition into an earlier report or baseline", async () => {
    const f = fixture();
    const earlier = new Date(f.head.capturedAt.getTime() - 1);
    const cadenceIntervalMs = vi.fn(async () => 123);
    const result = await readCurrentDefinitionsInTransaction(
      f.tx,
      context,
      f.source.projectPublicId,
      [f.source.keywordPublicId],
      earlier,
      { cadenceIntervalMs },
    );
    expect(result.get(f.source.keywordPublicId)).toEqual({
      expectedScope: null,
      freshForMs: null,
      freshnessReason: "policy_unavailable",
    });
    expect(cadenceIntervalMs).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("returns captured current scope and configured freshness without locks/writes/HTTP", async () => {
    const f = fixture();
    const http = vi.fn();
    vi.stubGlobal("fetch", http);
    try {
      const result = await readCurrentDefinitionsInTransaction(
        f.tx,
        context,
        f.source.projectPublicId,
        [f.source.keywordPublicId],
        asOf,
        freshness,
      );
      expect(result.get(f.source.keywordPublicId)).toMatchObject({
        expectedScope: {
          targetRevision: f.head.targetRevision,
          policyRevision: f.head.policyRevision,
          location: "Synthetic",
        },
        freshForMs: 12345,
      });
      expect(f.execute).not.toHaveBeenCalled();
      expect(http).not.toHaveBeenCalled();
      expect(f.raw.mock.calls.map(([strings]) => strings.join("?")).join(" ")).not.toMatch(
        /FOR (SHARE|UPDATE)|INSERT|UPDATE|DELETE/u,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps provider scope keys separate from viewer-facing location/language labels", async () => {
    const source = definitionSourceFixture();
    source.target.location.displayName = "Friendly location";
    source.target.location.languageCode = "friendly-language";
    const f = fixture(source);
    const result = await readCurrentDefinitionsInTransaction(
      f.tx,
      context,
      source.projectPublicId,
      [source.keywordPublicId],
      asOf,
      freshness,
    );
    expect(result.get(source.keywordPublicId)?.expectedScope).toMatchObject({
      location: "Synthetic",
      language: "en",
    });
  });
  it.each([{ installed: false }, { head: false }])(
    "keeps legacy/nohead unavailable without initializing anything (%j)",
    async (options) => {
      const f = fixture(undefined, options);
      const result = await readCurrentDefinitionsInTransaction(
        f.tx,
        context,
        f.source.projectPublicId,
        [f.source.keywordPublicId],
        asOf,
        freshness,
      );
      expect(result.get(f.source.keywordPublicId)?.expectedScope).toBeNull();
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it("rejects stale head proof instead of synthesizing current revision from mutable metadata", async () => {
    const f = fixture();
    f.source.epochs.keywordTarget = "2";
    const result = await readCurrentDefinitionsInTransaction(
      f.tx,
      context,
      f.source.projectPublicId,
      [f.source.keywordPublicId],
      asOf,
      freshness,
    );
    expect(result.get(f.source.keywordPublicId)?.expectedScope).toBeNull();
  });
  it.each([{ actorActive: false }, { member: false }])(
    "renews real authority despite a forged old owner claim (%j)",
    async (options) => {
      const f = fixture(undefined, options);
      await expect(
        readCurrentDefinitionsInTransaction(
          f.tx,
          context,
          f.source.projectPublicId,
          [f.source.keywordPublicId],
          asOf,
          freshness,
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  it("propagates outage and rejects damaged guards rather than presenting missing data", async () => {
    const broken = fixture(undefined, { intact: false });
    await expect(
      readCurrentDefinitionsInTransaction(
        broken.tx,
        context,
        broken.source.projectPublicId,
        [broken.source.keywordPublicId],
        asOf,
        freshness,
      ),
    ).rejects.toMatchObject({ code: "measurement_definition_integrity" });
    const down = fixture();
    down.raw.mockRejectedValueOnce(new Error("Synthetic database outage"));
    await expect(
      readCurrentDefinitionsInTransaction(
        down.tx,
        context,
        down.source.projectPublicId,
        [down.source.keywordPublicId],
        asOf,
        freshness,
      ),
    ).rejects.toThrow("Synthetic database outage");
  });
  it("renews credential transport authority before any target/source read", async () => {
    const f = fixture();
    const assertFreshScope = vi.fn(async () => {
      throw new Error("Revoked credential");
    });
    await expect(
      readCurrentDefinitionsForVerifiedScope(
        f.tx,
        {
          project: { id: f.source.projectId, publicId: f.source.projectPublicId },
          keywordPublicIds: [f.source.keywordPublicId],
          asOf,
        },
        { assertFreshScope, freshness },
      ),
    ).rejects.toThrow("Revoked credential");
    expect(f.raw).not.toHaveBeenCalled();
    expect(f.tx.keyword.findMany).not.toHaveBeenCalled();
  });
});
