import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateProjectDefaults } from "./project-defaults";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  refreshKeywordDispatchStates: vi.fn(),
  resolveKeywordLocation: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/rank-check/dispatcher-state", () => ({
  refreshKeywordDispatchStates: mocks.refreshKeywordDispatchStates,
}));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));

const schedule = {
  cron_expression: null,
  frequency: "manual",
  jitter_minutes: 0,
  serp_stop_on_match: false,
  timezone: "UTC",
};

function context(body: unknown) {
  return {
    actorId: null,
    auth: {
      apiKey: { projectId: "project_1" },
      project: { id: "project_1", publicId: "prj_a00000000000000000000000" },
    },
    headers: new Headers(),
    req: new Request("https://example.com/api/v1/projects/prj_a00000000000000000000000/defaults", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
  } as never;
}

async function patchDefaults(body: unknown) {
  const response = await updateProjectDefaults(context(body), "prj_a00000000000000000000000");
  const resolution = mocks.resolveKeywordLocation.mock.calls[0]?.[0];
  const upsert = mocks.prisma.projectDefaults.upsert.mock.calls[0]?.[0];
  return { body: await response.json(), resolution, status: response.status, upsert };
}

describe("project defaults legacy market contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((run: (tx: unknown) => unknown) =>
      run(mocks.prisma),
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.prisma.projectDefaults.upsert.mockImplementation(({ create }: { create: object }) =>
      Promise.resolve({ id: "defaults_1", lastCheckedAt: null, nextCheckAt: null, ...create }),
    );
    mocks.resolveKeywordLocation.mockResolvedValue({
      degraded: false,
      location: {
        canonicalKey: "DE",
        cityName: null,
        countryCode: "DE",
        displayName: "Germany",
        id: "loc_de",
        kind: "country",
      },
      warning: null,
    });
  });

  it.each([
    [
      "country name",
      { country: "Germany", device: "mobile" },
      { device: "mobile", location_key: "DE" },
    ],
    [
      "country alias",
      { country: "de", device: "mobile" },
      { device: "mobile", location_key: "DE" },
    ],
  ])(
    "persists identical defaults for the legacy %s shape and the location_key shape",
    async (_label, legacy, modern) => {
      const old = await patchDefaults({ ...schedule, ...legacy });
      vi.clearAllMocks();
      mocks.prisma.$transaction.mockImplementation((run: (tx: unknown) => unknown) =>
        run(mocks.prisma),
      );
      mocks.prisma.keyword.findMany.mockResolvedValue([]);
      mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
      mocks.prisma.projectDefaults.upsert.mockImplementation(({ create }: { create: object }) =>
        Promise.resolve({ id: "defaults_1", lastCheckedAt: null, nextCheckAt: null, ...create }),
      );
      mocks.resolveKeywordLocation.mockResolvedValue({
        degraded: false,
        location: {
          canonicalKey: "DE",
          cityName: null,
          countryCode: "DE",
          displayName: "Germany",
          id: "loc_de",
          kind: "country",
        },
        warning: null,
      });
      const fresh = await patchDefaults({ ...schedule, ...modern });

      expect(old.status).toBe(200);
      expect(fresh.status).toBe(200);
      expect(old.resolution).toEqual({
        projectId: "project_1",
        selection: { canonicalKey: "DE", kind: "city" },
      });
      expect(fresh.resolution).toEqual(old.resolution);
      expect(fresh.upsert).toEqual(old.upsert);
      expect(old.upsert).toMatchObject({
        create: { country: "Germany", device: "mobile", locationKey: "DE" },
      });
      expect(fresh.body).toEqual(old.body);
      expect(old.body).toMatchObject({ country: "Germany", device: "mobile", location_key: "DE" });
    },
  );
});

describe("project defaults serp depth contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((run: (tx: unknown) => unknown) =>
      run(mocks.prisma),
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.projectDefaults.upsert.mockImplementation(({ update }: { update: object }) =>
      Promise.resolve({ id: "defaults_1", lastCheckedAt: null, nextCheckAt: null, ...update }),
    );
  });

  it("keeps the stored serp_depth when the patch omits it", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      ...schedule,
      cronExpression: null,
      jitterMinutes: 0,
      serpDepth: 20,
      serpStopOnMatch: false,
    });
    const result = await patchDefaults(schedule);

    expect(result.status).toBe(200);
    expect(result.upsert).toMatchObject({ update: { serpDepth: 20 } });
    expect(result.body).toMatchObject({ serp_depth: 20 });
  });

  it("falls back to the default depth for a project without stored defaults", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    const result = await patchDefaults(schedule);

    expect(result.upsert).toMatchObject({ update: { serpDepth: 100 } });
  });

  it("stores an explicit serp_depth", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    const result = await patchDefaults({ ...schedule, serp_depth: 50 });

    expect(result.upsert).toMatchObject({ update: { serpDepth: 50 } });
    expect(result.body).toMatchObject({ serp_depth: 50 });
  });
});
