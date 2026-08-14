import { ProjectMarketLimitExceededError } from "@/lib/markets/limits";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKeywords, KEYWORD_CREATE_TRANSACTION_TIMEOUT_MS } from "./keyword-create";

const fixtures = vi.hoisted(() => {
  const calls: string[] = [];
  const keyword = {
    device: "desktop",
    id: "keyword_1",
    intent: null,
    location: "United States",
    publicId: "kw_a00000000000000000000000",
    schedule: null,
    tags: [],
    targetUrl: null,
    text: "atomic keyword",
    topic: null,
  };
  const mocks = {
    createKeywordBatchSet: vi.fn(),
    resolveKeywordLocation: vi.fn(),
    transaction: vi.fn(),
    writeAudit: vi.fn(),
  };
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: {
      findMany: vi.fn(async (args: object) => ("include" in args ? [keyword] : [])),
    },
    keywordSchedule: {},
    keywordTag: {},
    projectDefaults: { findUnique: vi.fn(async () => null) },
    tag: {},
  };
  return { calls, keyword, mocks, tx };
});
const { calls, keyword, mocks, tx } = fixtures;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({
  parseActionInput: (_schema: unknown, input: unknown) => input,
}));
vi.mock("@/lib/actions/keyword-helpers", () => ({
  createKeywordBatchSet: fixtures.mocks.createKeywordBatchSet,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: fixtures.mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    ...fixtures.tx,
    $transaction: fixtures.mocks.transaction,
  },
}));
vi.mock("@/lib/serp/default-market", () => ({
  projectDefaultSerpMarket: () => ({
    city: null,
    country: "United States",
    device: "desktop",
    locationKey: null,
  }),
}));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: fixtures.mocks.resolveKeywordLocation,
}));
vi.mock("./resources", () => ({
  keywordInclude: {},
  keywordResource: (stored: { publicId: string }) => ({
    id: stored.publicId,
    type: "keyword",
  }),
}));

function context(
  body: unknown = { keyword: "atomic keyword", location: "United States", tags: [] },
) {
  return {
    auth: {
      project: {
        id: "project_1",
        publicId: "prj_a00000000000000000000000",
      },
    },
    headers: new Headers(),
    instance: "urn:bisibility:test",
    req: new Request("https://example.com/api/v1/projects/project_1/keywords", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  } as never;
}

describe("REST keyword creation transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    mocks.resolveKeywordLocation.mockImplementation(async () => {
      calls.push("location");
      return {
        location: {
          countryCode: "US",
          displayName: "United States",
          id: "location_1",
          languageCode: "en",
          languageLabel: "English",
        },
        warning: null,
      };
    });
    mocks.transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => {
        calls.push("transaction");
        return callback(tx);
      },
    );
    mocks.createKeywordBatchSet.mockResolvedValue({
      accepted: [{ created: true, keyword, row: {} }],
      created: [keyword],
    });
  });

  it("resolves locations before opening its explicitly budgeted transaction", async () => {
    const response = await createKeywords(context(), "prj_a00000000000000000000000");

    expect(response.status).toBe(201);
    expect(calls).toEqual(["location", "transaction"]);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: KEYWORD_CREATE_TRANSACTION_TIMEOUT_MS,
    });
  });

  it("reuses a caller-supplied transaction without nesting or setting a timeout", async () => {
    const response = await createKeywords(context(), "prj_a00000000000000000000000", tx as never);

    expect(response.status).toBe(201);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createKeywordBatchSet).toHaveBeenCalledWith(tx, "project_1", expect.any(Array));
  });

  it("keeps same-pair duplicates skipped while creating a keyword in another language pair", async () => {
    const spanish = { ...keyword, id: "keyword_es", publicId: "kw_b00000000000000000000000" };
    const english = { ...keyword, id: "keyword_en", publicId: "kw_c00000000000000000000000" };
    mocks.resolveKeywordLocation.mockImplementation(async (input) => {
      const key = "selection" in input ? input.selection.canonicalKey : "";
      return {
        location:
          key === "ES/Andalusia/Malaga@en"
            ? {
                canonicalKey: key,
                countryCode: "ES",
                displayName: "Malaga, Andalusia, Spain",
                id: "location_es_en",
                languageCode: "en",
                languageLabel: "English",
              }
            : {
                canonicalKey: "ES/Andalusia/Malaga",
                countryCode: "ES",
                displayName: "Malaga, Andalusia, Spain",
                id: "location_es",
                languageCode: "es",
                languageLabel: "Spanish",
              },
        warning: null,
      };
    });
    mocks.createKeywordBatchSet.mockResolvedValue({
      accepted: [
        { created: false, keyword: spanish, row: {} },
        { created: true, keyword: english, row: {} },
      ],
      created: [english],
    });
    tx.keyword.findMany.mockResolvedValue([spanish, english]);

    const response = await createKeywords(
      context([
        { keyword: "rank tracker", location_key: "ES/Andalusia/Malaga" },
        { keyword: "rank tracker", location_key: "ES/Andalusia/Malaga@en" },
      ]),
      "prj_a00000000000000000000000",
    );

    expect(await response.json()).toMatchObject({
      created: 1,
      results: [{ status: "skipped" }, { status: "created" }],
      skipped: 1,
    });
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "ES/Andalusia/Malaga", kind: "city" },
    });
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "ES/Andalusia/Malaga@en", kind: "city" },
    });
  });

  it("propagates a batch failure so the owning transaction can roll back", async () => {
    mocks.createKeywordBatchSet.mockRejectedValueOnce(new Error("seed failed"));

    await expect(createKeywords(context(), "prj_a00000000000000000000000")).rejects.toThrow(
      "seed failed",
    );
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("maps the project-market cap to a typed problem response", async () => {
    mocks.createKeywordBatchSet.mockRejectedValueOnce(new ProjectMarketLimitExceededError(5));

    const response = await createKeywords(context(), "prj_a00000000000000000000000");

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toMatchObject({
      detail: "This project can track up to 5 markets.",
      status: 403,
      type: "https://bisibility.com/problems/forbidden",
    });
  });
});
