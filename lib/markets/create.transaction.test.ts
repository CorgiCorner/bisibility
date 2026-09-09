import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  resolveKeywordLocation: vi.fn(),
  refreshKeywordDispatchStates: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rank-check/dispatcher-state", () => ({
  refreshKeywordDispatchStates: mocks.refreshKeywordDispatchStates,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));

import { normalizeCanonicalLocationKey } from "@/lib/serp/location";
import {
  createProjectMarket,
  MarketExistsError,
  MarketLocationError,
  MarketScheduleError,
  MarketSourceError,
} from "./create";

const actorId = "user_1";
const projectId = "project_internal_1";
const publicProjectId = `prj_${"a".repeat(24)}`;
const sourceMarketId = `pmkt_${"b".repeat(24)}`;
const scheduleId = `sch_${"c".repeat(24)}`;

type StoredMarket = {
  id: string;
  location: { canonicalKey: string };
  locationId: string;
  publicId: string;
  status: "active" | "paused" | "removed";
};
type StoredKeyword = {
  checkScheduleId: string | null;
  device: "desktop" | "mobile";
  id: string;
  locationId: string;
  publicId: string;
  projectId: string;
  targetUrl: string | null;
  text: string;
};
type Store = {
  audits: string[];
  keywordSchedules: string[];
  keywords: StoredKeyword[];
  markets: StoredMarket[];
};

let store: Store;

/** The rows the Location table would hand back, canonical key and kind included. */
const locationRows = {
  location_city: {
    canonicalKey: "ES/Andalusia/Malaga@en",
    countryCode: "ES",
    displayName: "Malaga, Andalusia, Spain",
    id: "location_city",
    kind: "city" as const,
    languageCode: "en",
    languageLabel: "English",
  },
  location_region: {
    canonicalKey: "ES/Andalusia@en",
    countryCode: "ES",
    displayName: "Andalusia, Spain",
    id: "location_region",
    kind: "region" as const,
    languageCode: "en",
    languageLabel: "English",
  },
  location_target: {
    canonicalKey: "ES",
    countryCode: "ES",
    displayName: "All of Spain",
    id: "location_target",
    kind: "country" as const,
    languageCode: "es",
    languageLabel: "Spanish",
  },
};

type LocationRow = (typeof locationRows)[keyof typeof locationRows];

/** What the resolver would answer for a selection, keyed the way the service asks for it. */
function resolveSelection(selection: Record<string, unknown>): {
  degraded: boolean;
  location: LocationRow;
  warning: string | null;
} {
  const rows = Object.values(locationRows);
  if (selection.canonicalKey === "ES/Nowhere/Nada@en") {
    return {
      degraded: true,
      location: locationRows.location_target,
      warning: "Could not resolve Nada; tracking at country level.",
    };
  }
  const row = rows.find((candidate) => candidate.canonicalKey === selection.canonicalKey);
  if (!row) throw new Error(`Unsupported location key: ${String(selection.canonicalKey)}`);
  return { degraded: false, location: row, warning: null };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    canonicalKey: "ES",
    countryCode: "ES",
    devices: ["desktop"],
    kind: "country",
    languageCode: "es",
    method: { kind: "paste", text: "rank tracker | /rank" },
    name: "Spain search",
    projectId: publicProjectId,
    schedule: { kind: "existing", scheduleId },
    ...overrides,
  };
}

function market(
  data: Omit<StoredMarket, "id" | "location"> & { canonicalKey?: string },
): StoredMarket {
  return {
    id: `market_${store.markets.length + 1}`,
    location: { canonicalKey: data.canonicalKey ?? "ES" },
    locationId: data.locationId,
    publicId: data.publicId,
    status: data.status,
  };
}

function transactionClient() {
  return {
    checkSchedule: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "schedule_inline",
        ...data,
      })),
      findFirst: vi.fn(async ({ where }: { where: { publicId: string } }) =>
        where.publicId === scheduleId
          ? {
              cronExpression: "0 6 * * 1",
              frequency: "weekly",
              id: "schedule_1",
              jitterMinutes: 60,
              name: "Weekly Monday",
              publicId: scheduleId,
              serpDepth: null,
              timezone: "UTC",
            }
          : null,
      ),
    },
    keyword: {
      createMany: vi.fn(
        async ({ data }: { data: Omit<StoredKeyword, "checkScheduleId" | "id">[] }) => {
          store.keywords.push(
            ...data.map((row, index) => ({
              ...row,
              checkScheduleId: null,
              id: `keyword_${store.keywords.length + index + 1}`,
            })),
          );
        },
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.publicId && typeof where.publicId === "object" && "in" in where.publicId) {
          const publicIds = (where.publicId as { in: string[] }).in;
          return store.keywords.filter((keyword) => publicIds.includes(keyword.publicId));
        }
        return store.keywords.filter(
          (keyword) =>
            keyword.projectId === where.projectId && keyword.locationId === where.locationId,
        );
      }),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: { checkScheduleId: string };
          where: { id: { in: string[] } };
        }) => {
          for (const keyword of store.keywords) {
            if (where.id.in.includes(keyword.id)) keyword.checkScheduleId = data.checkScheduleId;
          }
        },
      ),
    },
    keywordSchedule: {
      createMany: vi.fn(async ({ data }: { data: { keywordId: string }[] }) => {
        store.keywordSchedules.push(...data.map((row) => row.keywordId));
      }),
    },
    location: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          locationRows[where.id as keyof typeof locationRows] ?? null,
      ),
    },
    projectMarket: {
      count: vi.fn(async () => store.markets.filter((row) => row.status !== "removed").length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const stored = market({
          locationId: String(data.locationId),
          publicId: String(data.publicId),
          status: "active",
        });
        store.markets.push(stored);
        return stored;
      }),
      findFirst: vi.fn(
        async ({ where }: { where: { publicId: string; status: string } }) =>
          store.markets.find(
            (row) => row.publicId === where.publicId && row.status === where.status,
          ) ?? null,
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { projectId_locationId: { locationId: string } } }) =>
          store.markets.find((row) => row.locationId === where.projectId_locationId.locationId) ??
          null,
      ),
    },
  };
}

describe("createProjectMarket transaction", () => {
  it("refuses Start empty when legacy keywords already occupy the location", async () => {
    store.keywords.push({
      checkScheduleId: null,
      device: "desktop",
      id: "legacy_keyword",
      locationId: "location_target",
      projectId,
      publicId: `kw_${"d".repeat(24)}`,
      targetUrl: null,
      text: "existing term",
    });
    const before = structuredClone(store);
    await expect(
      createProjectMarket(actorId, projectId, input({ method: { kind: "empty" }, schedule: null })),
    ).rejects.toBeInstanceOf(MarketExistsError);
    expect(store).toEqual(before);
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    store = { audits: [], keywordSchedules: [], keywords: [], markets: [] };
    const tx = transactionClient();
    mocks.prisma.$transaction.mockImplementation(
      async (run: (client: typeof tx) => Promise<unknown>) => {
        const snapshot = structuredClone(store);
        try {
          return await run(tx);
        } catch (error) {
          store = snapshot;
          throw error;
        }
      },
    );
    mocks.writeAudit.mockImplementation(async ({ action }: { action: string }) => {
      store.audits.push(action);
    });
    mocks.resolveKeywordLocation.mockImplementation(
      async ({ selection }: { selection: Record<string, unknown> }) => resolveSelection(selection),
    );
  });

  it("refreshes dispatch state after persisting the assigned cadence in the same transaction", async () => {
    mocks.refreshKeywordDispatchStates.mockImplementationOnce(async ({ keywordIds }, tx) => {
      expect(store.keywordSchedules).toEqual(keywordIds);
      expect(store.keywords.every((keyword) => keyword.checkScheduleId)).toBe(true);
      expect(tx.keywordSchedule.createMany).toHaveBeenCalledOnce();
    });
    await createProjectMarket(actorId, projectId, input());
    expect(mocks.refreshKeywordDispatchStates).toHaveBeenCalledOnce();
    expect(mocks.refreshKeywordDispatchStates).toHaveBeenCalledWith(
      { keywordIds: store.keywords.map((keyword) => keyword.id) },
      expect.objectContaining({ keywordSchedule: expect.any(Object) }),
    );
  });

  it.each(["paste", "copy"] as const)(
    "persists manual %s targets without a schedule link or automatic next check",
    async (method) => {
      const tx = transactionClient();
      mocks.prisma.$transaction.mockImplementation(
        async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
      );
      if (method === "copy") {
        store.markets.push(
          market({ locationId: "location_source", publicId: sourceMarketId, status: "active" }),
        );
        store.keywords.push({
          checkScheduleId: "source_schedule",
          device: "desktop",
          id: "source_keyword",
          locationId: "location_source",
          projectId,
          publicId: `kw_${"d".repeat(24)}`,
          targetUrl: null,
          text: "rank tracker",
        });
      }
      await createProjectMarket(
        actorId,
        projectId,
        input({
          devices: ["desktop", "mobile"],
          method:
            method === "copy"
              ? { kind: method, sourceMarketId }
              : { kind: method, text: "rank tracker" },
          schedule: { kind: "manual" },
        }),
      );
      const created = store.keywords.filter((keyword) => keyword.locationId === "location_target");
      expect(created).toHaveLength(2);
      expect(created.every((keyword) => keyword.checkScheduleId === null)).toBe(true);
      expect(tx.checkSchedule.create).not.toHaveBeenCalled();
      expect(tx.checkSchedule.findFirst).not.toHaveBeenCalled();
      expect(tx.keywordSchedule.createMany).toHaveBeenCalledWith({
        data: created.map((keyword) =>
          expect.objectContaining({
            keywordId: keyword.id,
            frequency: "manual",
            cronExpression: null,
            nextCheckAt: null,
          }),
        ),
      });
      expect(tx.keywordSchedule.createMany.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.refreshKeywordDispatchStates.mock.invocationCallOrder[0],
      );
      expect(store.audits).toEqual(["project_market.create"]);
    },
  );

  it("copies source text into new target identities, devices, schedule links, and one market audit", async () => {
    store.markets.push(
      market({ locationId: "location_source", publicId: sourceMarketId, status: "active" }),
    );
    const source = {
      checkScheduleId: "source_schedule",
      device: "mobile" as const,
      id: "source_keyword",
      locationId: "location_source",
      projectId,
      publicId: `kw_${"d".repeat(24)}`,
      targetUrl: "/source",
      text: "rank tracker",
    };
    store.keywords.push(source);

    const result = await createProjectMarket(
      actorId,
      projectId,
      input({ devices: ["desktop", "mobile"], method: { kind: "copy", sourceMarketId } }),
    );

    expect(result.keywordCount).toBe(2);
    const created = store.keywords.filter((keyword) => keyword.id !== source.id);
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          device: "desktop",
          locationId: "location_target",
          text: "rank tracker",
        }),
        expect.objectContaining({
          device: "mobile",
          locationId: "location_target",
          text: "rank tracker",
        }),
      ]),
    );
    expect(created.every((keyword) => keyword.publicId !== source.publicId)).toBe(true);
    expect(source).toMatchObject({
      checkScheduleId: "source_schedule",
      locationId: "location_source",
      targetUrl: "/source",
    });
    expect(store.keywordSchedules).toHaveLength(2);
    expect(store.audits).toEqual(["project_market.create"]);
  });

  it("resolves the key through the location service for the internal project, then writes every row against that project", async () => {
    const tx = transactionClient();
    mocks.prisma.$transaction.mockImplementation(
      async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    );

    await createProjectMarket(actorId, projectId, input());

    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId,
      selection: { canonicalKey: "ES", kind: "country" },
    });
    expect(tx.location.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "location_target" } }),
    );
    expect(tx.projectMarket.findUnique).toHaveBeenCalledWith({
      include: { location: { select: { canonicalKey: true } } },
      where: { projectId_locationId: { locationId: "location_target", projectId } },
    });
    expect(tx.projectMarket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ locationId: "location_target", projectId }),
    });
    expect(tx.keyword.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ locationId: "location_target", projectId })],
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project_market.create", projectId }),
      tx,
    );
    expect(JSON.stringify(tx.projectMarket.create.mock.calls)).not.toContain(publicProjectId);
  });

  it("selects a city or region by its canonical key, never by the name the form showed", async () => {
    await createProjectMarket(
      actorId,
      projectId,
      input({
        canonicalKey: "ES/Andalusia/Malaga@en",
        kind: "city",
        languageCode: "en",
        method: { kind: "empty" },
        name: "Somewhere else entirely",
        schedule: null,
      }),
    );

    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId,
      selection: { canonicalKey: "ES/Andalusia/Malaga@en", kind: "city" },
    });
    expect(store.markets[0]).toMatchObject({ locationId: "location_city" });
  });

  it("refuses a key whose resolution degraded to the country or disagrees with the form", async () => {
    await expect(
      createProjectMarket(
        actorId,
        projectId,
        input({ canonicalKey: "ES/Nowhere/Nada@en", kind: "city", languageCode: "en" }),
      ),
    ).rejects.toBeInstanceOf(MarketLocationError);
    await expect(
      createProjectMarket(actorId, projectId, input({ kind: "city" })),
    ).rejects.toBeInstanceOf(MarketLocationError);
    await expect(
      createProjectMarket(
        actorId,
        projectId,
        input({ canonicalKey: "ES/Andalusia/Malaga@en", kind: "city", languageCode: "es" }),
      ),
    ).rejects.toBeInstanceOf(MarketLocationError);
    await expect(
      createProjectMarket(actorId, projectId, input({ countryCode: "FR" })),
    ).rejects.toBeInstanceOf(MarketLocationError);

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(store.markets).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it.each([
    { expected: "All of Spain", name: undefined },
    { expected: "All of Spain", name: "" },
    { expected: "All of Spain", name: "   " },
    { expected: "Spain search", name: "  Spain search  " },
  ])(
    "uses the location display name only when optional name is blank",
    async ({ expected, name }) => {
      const tx = transactionClient();
      mocks.prisma.$transaction.mockImplementation(
        async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
      );

      await createProjectMarket(
        actorId,
        projectId,
        input({ method: { kind: "empty" }, name, schedule: null }),
      );

      expect(tx.projectMarket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: expected }),
      });
    },
  );

  it("returns the stored location identity of a country market next to its public id", async () => {
    const result = await createProjectMarket(
      actorId,
      projectId,
      input({ method: { kind: "empty" }, schedule: null }),
    );

    expect(result).toEqual({
      canonicalKey: "ES",
      countryCode: "ES",
      displayName: "All of Spain",
      keywordCount: 0,
      kind: "country",
      languageCode: "es",
      languageLabel: "Spanish",
      publicId: store.markets[0].publicId,
    });
    expect(result.publicId.startsWith("pmkt_")).toBe(true);
  });

  it.each(["location_city", "location_region"] as const)(
    "returns %s keys with their path, kind and language qualifier intact",
    async (locationId) => {
      const row = locationRows[locationId];

      const result = await createProjectMarket(
        actorId,
        projectId,
        input({
          canonicalKey: row.canonicalKey,
          kind: row.kind,
          languageCode: "en",
          method: { kind: "empty" },
          schedule: null,
        }),
      );

      expect(result.canonicalKey).toBe(row.canonicalKey);
      expect(result.kind).toBe(row.kind);
      expect(result.displayName).toBe(row.displayName);
      expect(result.languageLabel).toBe(row.languageLabel);
      expect(result.countryCode).toBe(row.countryCode);
      expect(result.languageCode).toBe(row.languageCode);
      expect(normalizeCanonicalLocationKey(result.canonicalKey).canonicalKey).toBe(
        row.canonicalKey,
      );
    },
  );

  it.each(["active", "paused"] as const)(
    "refuses an existing %s pair without writing",
    async (status) => {
      store.markets.push(
        market({ locationId: "location_target", publicId: sourceMarketId, status }),
      );

      await expect(createProjectMarket(actorId, projectId, input())).rejects.toBeInstanceOf(
        MarketExistsError,
      );

      expect(store.markets).toHaveLength(1);
      expect(store.keywords).toHaveLength(0);
      expect(store.audits).toHaveLength(0);
    },
  );

  it("refuses a removed pair, invalid location, removed source, and denied schedule before writes", async () => {
    store.markets.push(
      market({
        locationId: "location_target",
        publicId: sourceMarketId,
        status: "removed",
        canonicalKey: "ES",
      }),
    );
    await expect(createProjectMarket(actorId, projectId, input())).rejects.toMatchObject({
      name: "MarketArchivedError",
    });
    expect(store.audits).toHaveLength(0);

    store = { audits: [], keywordSchedules: [], keywords: [], markets: [] };
    await expect(
      createProjectMarket(actorId, projectId, input({ canonicalKey: "invalid", kind: "city" })),
    ).rejects.toBeInstanceOf(MarketLocationError);
    await expect(
      createProjectMarket(actorId, projectId, input({ method: { kind: "copy", sourceMarketId } })),
    ).rejects.toBeInstanceOf(MarketSourceError);
    await expect(
      createProjectMarket(
        actorId,
        projectId,
        input({ schedule: { kind: "existing", scheduleId: `sch_${"e".repeat(24)}` } }),
      ),
    ).rejects.toBeInstanceOf(MarketScheduleError);
    expect(store.markets).toHaveLength(0);
    expect(store.keywords).toHaveLength(0);
  });

  it("rolls back the market, keywords, schedule links, and audit when a later step fails", async () => {
    await expect(
      createProjectMarket(
        actorId,
        projectId,
        input({ method: { kind: "empty" }, schedule: null }),
        {
          afterMarketInsert: () => {
            throw new Error("forced after market");
          },
        },
      ),
    ).rejects.toThrow("forced after market");
    expect(store).toEqual({ audits: [], keywordSchedules: [], keywords: [], markets: [] });

    await expect(
      createProjectMarket(actorId, projectId, input(), {
        afterKeywordInsert: () => {
          throw new Error("forced after keyword");
        },
      }),
    ).rejects.toThrow("forced after keyword");
    expect(store).toEqual({ audits: [], keywordSchedules: [], keywords: [], markets: [] });
  });
});
