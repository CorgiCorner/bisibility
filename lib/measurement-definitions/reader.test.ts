import { loadRankTrackerMetadataBatches } from "@/lib/queries/rank-tracker-metadata-batches";
import { createRankTrackerHostReportOptions } from "@/lib/queries/rank-tracker-report-host";
import { describe, expect, it, vi } from "vitest";
import { currentDefinitionMetadataLoader } from "./query-adapter";

vi.mock("@/lib/queries/rank-tracker-captured-metrics", () => ({
  loadCapturedRankTrackerMetrics: vi.fn(async () => new Map()),
}));

import { definitionHeadFixture, definitionSourceFixture } from "./fixtures";
import type { DefinitionTransaction } from "./model";
import {
  readCurrentDefinitionsForVerifiedScope,
  readCurrentDefinitionsInTransaction,
  readDefinitionsAtDatesForVerifiedScope,
  readDefinitionsAtDatesInTransaction,
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
    allowedActor?: string;
  } = {},
) {
  const head = definitionHeadFixture(source);
  const raw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes("FROM users"))
      return options.actorActive === false ||
        (options.allowedActor !== undefined && values[0] !== options.allowedActor)
        ? []
        : [{ id: "reader" }];
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

describe("paired definition snapshot reads", () => {
  const current = new Date("2026-10-10T00:00:00Z");
  const baseline = new Date("2026-10-03T00:00:00Z");
  it("pays seven delayed DB round trips once for current and baseline, without HTTP", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const http = vi.fn();
    vi.stubGlobal("fetch", http);
    const delay = async () => new Promise<void>((resolve) => setTimeout(resolve, 200));
    for (const fn of [f.raw, f.tx.project.findUnique, f.tx.keyword.findMany]) {
      const original = vi.mocked(fn).getMockImplementation();
      if (!original) throw new Error("Fixture implementation missing");
      vi.mocked(fn).mockImplementation((async (...args: unknown[]) => {
        await delay();
        return Reflect.apply(original, undefined, args);
      }) as never);
    }
    try {
      const start = Date.now();
      const host = createRankTrackerHostReportOptions(
        { actor: { id: "reader" }, transport: "session" },
        currentDefinitionMetadataLoader(context, freshness),
        current,
      );
      const pending = host.loadMetadata(
        f.tx,
        { id: f.source.projectId, publicId: f.source.projectPublicId },
        [{ id: f.source.keywordId, publicId: f.source.keywordPublicId }],
        current,
      );
      await vi.runAllTimersAsync();
      const now = await pending;
      expect(Date.now() - start).toBe(1400);
      expect(f.raw).toHaveBeenCalledTimes(5);
      expect(f.tx.project.findUnique).toHaveBeenCalledTimes(1);
      expect(f.tx.keyword.findMany).toHaveBeenCalledTimes(1);
      expect(now.get(f.source.keywordPublicId)?.expectedScope).not.toBeNull();
      expect(now.get(f.source.keywordPublicId)?.baselineWindow?.before).toEqual(baseline);
      expect(http).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
  it("bounds authority capture to each 500-target batch without a cross-batch cache", async () => {
    const f = fixture();
    let selected = [f.source];
    vi.mocked(f.tx.keyword.findMany).mockImplementation((async (args: {
      where: { publicId: { in: string[] } };
    }) => {
      selected = args.where.publicId.in.map((publicId) => {
        const source = definitionSourceFixture();
        return { ...source, keywordPublicId: publicId, keywordId: `internal-${publicId}` };
      });
      return selected.map((source) => ({ id: source.keywordId, publicId: source.keywordPublicId }));
    }) as never);
    const original = f.raw.getMockImplementation();
    if (!original) throw new Error("Fixture implementation missing");
    f.raw.mockImplementation(async (strings) =>
      strings.join("?").includes('AS "hasHead"')
        ? selected.map((source) => ({
            ...definitionHeadFixture(source),
            keywordId: source.keywordId,
            hasHead: true,
            source,
          }))
        : original(strings),
    );
    const host = createRankTrackerHostReportOptions(
      { actor: { id: "reader" }, transport: "session" },
      currentDefinitionMetadataLoader(context, freshness),
      current,
    );
    const targets = Array.from({ length: 501 }, (_, i) => ({
      id: `internal-${i}`,
      publicId: `kw_synthetic_${i}`,
    }));
    const result = await loadRankTrackerMetadataBatches(
      host.loadMetadata,
      f.tx,
      { id: f.source.projectId, publicId: f.source.projectPublicId },
      targets,
      current,
    );
    expect(result.size).toBe(501);
    expect(f.tx.keyword.findMany).toHaveBeenCalledTimes(2);
    expect(f.tx.project.findUnique).toHaveBeenCalledTimes(2);
    expect(f.raw).toHaveBeenCalledTimes(10);
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each([0, 1])("rejects a paired loader returning %i maps for two dates", async (count) => {
    const f = fixture();
    const loader = Object.assign(async () => new Map(), {
      atDates: async () => Array.from({ length: count }, () => new Map()),
    });
    const host = createRankTrackerHostReportOptions(undefined, loader, current);
    await expect(
      host.loadMetadata(
        f.tx,
        { id: f.source.projectId, publicId: f.source.projectPublicId },
        [],
        current,
      ),
    ).rejects.toThrow("Definition loader returned a mismatched snapshot");
    expect(f.raw).not.toHaveBeenCalled();
  });
  it("recomputes calendar freshness at each date from one captured source", async () => {
    const source = definitionSourceFixture();
    if (!source.policy.defaults) throw new Error("Fixture defaults missing");
    source.policy.defaults.frequency = "daily";
    const f = fixture(source);
    const cadenceIntervalMs = vi.fn(async (_tx, _source, at: Date) =>
      at.getTime() === current.getTime() ? 23 * 3600000 : 25 * 3600000,
    );
    const [now, before] = await readDefinitionsAtDatesInTransaction(
      f.tx,
      context,
      source.projectPublicId,
      [source.keywordPublicId],
      [current, baseline],
      { cadenceIntervalMs },
    );
    expect(now.get(source.keywordPublicId)?.freshForMs).toBe(23 * 3600000 + 321);
    expect(before.get(source.keywordPublicId)?.freshForMs).toBe(25 * 3600000 + 321);
    expect(cadenceIntervalMs.mock.calls.map(([, , at]) => at)).toEqual([current, baseline]);
  });
  it("keeps baseline unavailable when its definition was captured later", async () => {
    const f = fixture();
    f.head.capturedAt.setTime(new Date("2026-10-05T00:00:00Z").getTime());
    const [now, before] = await readDefinitionsAtDatesInTransaction(
      f.tx,
      context,
      f.source.projectPublicId,
      [f.source.keywordPublicId],
      [current, baseline],
      freshness,
    );
    expect(now.get(f.source.keywordPublicId)?.expectedScope).not.toBeNull();
    expect(before.get(f.source.keywordPublicId)?.expectedScope).toBeNull();
  });
  it("never reuses session or credential authority across invocations or transactions", async () => {
    const f = fixture(undefined, { allowedActor: "reader" });
    const revoked = fixture(undefined, { member: false });
    await readDefinitionsAtDatesInTransaction(
      f.tx,
      context,
      f.source.projectPublicId,
      [f.source.keywordPublicId],
      [current, baseline],
      freshness,
    );
    await expect(
      readDefinitionsAtDatesInTransaction(
        revoked.tx,
        context,
        revoked.source.projectPublicId,
        [revoked.source.keywordPublicId],
        [current, baseline],
        freshness,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    const assertFreshScope = vi.fn(async () => {});
    const input = {
      project: { id: f.source.projectId, publicId: f.source.projectPublicId },
      keywordPublicIds: [f.source.keywordPublicId],
      dates: [current, baseline],
    };
    await readDefinitionsAtDatesForVerifiedScope(f.tx, input, { assertFreshScope, freshness });
    assertFreshScope.mockRejectedValueOnce(new Error("Revoked key"));
    await expect(
      readDefinitionsAtDatesForVerifiedScope(f.tx, input, { assertFreshScope, freshness }),
    ).rejects.toThrow("Revoked key");
    expect(assertFreshScope).toHaveBeenCalledTimes(2);
    const otherActor = { actor: { id: "different-reader" } };
    await expect(
      readDefinitionsAtDatesInTransaction(
        f.tx,
        otherActor,
        f.source.projectPublicId,
        [f.source.keywordPublicId],
        [current, baseline],
        freshness,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(f.tx.project.findUnique).toHaveBeenCalledTimes(2);
  });
});
