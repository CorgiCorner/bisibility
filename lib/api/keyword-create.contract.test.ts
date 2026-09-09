import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKeywordAfterDefault } from "./keyword-create-test-harness";

// The real translator, location service, resolver, and Prisma-backed store run here;
// only the database rows and the audit sink are faked. Both wire shapes must reach the
// same persisted keyword row through the same canonical location key.
const mocks = vi.hoisted(() => ({
  prisma: {
    location: { findUnique: vi.fn(), upsert: vi.fn() },
    providerConnection: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));

const defaults = {
  city: null,
  country: "United States",
  device: "desktop" as const,
  locationKey: "US",
};

type Run = Awaited<ReturnType<typeof createKeywordAfterDefault>>;

// Public ids are generated per row; everything else must match between the two shapes.
function persistedRows(run: Run) {
  return run.createdRows.map(({ publicId: _publicId, ...row }) => row);
}

async function responseBody(run: Run) {
  const body = (await run.response.json()) as {
    results: { keyword: { id: string } }[];
  };
  return {
    ...body,
    results: body.results.map(({ keyword: { id: _id, ...keyword }, ...result }) => ({
      ...result,
      keyword,
    })),
  };
}

describe("keyword create legacy market contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.location.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    mocks.prisma.location.upsert.mockImplementation(
      ({ create }: { create: { canonicalKey: string } }) =>
        Promise.resolve({ ...create, id: `loc_${create.canonicalKey}` }),
    );
  });

  it.each([
    ["country name", { country: "Germany" }, { location_key: "DE" }],
    ["location alias", { location: "usa" }, { location_key: "US" }],
    ["country plus language", { country: "Spain", language: "en" }, { location_key: "ES@en" }],
    ["country plus default language", { country: "Spain", language: "es" }, { location_key: "ES" }],
  ])(
    "persists the same keyword for the legacy %s shape and the location_key shape",
    async (_label, legacy, modern) => {
      const old = await createKeywordAfterDefault(defaults, { keyword: "rank tracker", ...legacy });
      const fresh = await createKeywordAfterDefault(defaults, {
        keyword: "rank tracker",
        ...modern,
      });

      expect(old.response.status).toBe(201);
      expect(fresh.response.status).toBe(201);
      expect(old.createdRows).toHaveLength(1);
      expect(persistedRows(fresh)).toEqual(persistedRows(old));
      expect(await responseBody(fresh)).toEqual(await responseBody(old));
    },
  );
});
