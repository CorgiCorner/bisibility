import { beforeEach, describe, expect, it, vi } from "vitest";
import { maybePersistKeywordResearchSnapshot } from "./snapshot";

const mocks = vi.hoisted(() => ({
  editable: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/demo/research-storage", () => ({
  demoResearchFreshUntil: (values: string[]) =>
    new Date(Math.min(...values.map(Date.parse)) + 30 * 86_400_000),
  isEditableDemoResearchProject: mocks.editable,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

const project = { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx" };
const outcome = {
  cached: false,
  cachedUntil: "2026-08-11T12:00:00.000Z",
  connections: [],
  costCents: 0,
  fetchedAt: "2026-08-11T12:00:00.000Z",
  ok: true as const,
  provider: "Stored provider",
  rows: [
    {
      alreadySaved: true,
      alreadyTracked: true,
      competition: null,
      cpcCents: null,
      difficulty: null,
      intent: null,
      keyword: "zero-safe",
      monthlyTrend: [],
      searchVolume: null,
      source: "idea" as const,
    },
  ],
  sources: [
    { cached: true, costCents: 0, returned: 0, source: "idea" as const, status: "ok" as const },
  ],
};

function writeInput(overrides: Record<string, unknown> = {}) {
  return {
    includeClickstream: false,
    location: { gl: "us", hl: "en" },
    mode: "ideas" as const,
    outcome,
    project,
    resultLimit: 100,
    seed: "seed",
    successfulFetchedAts: [outcome.fetchedAt],
    ...overrides,
  };
}

describe("keyword research snapshot persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.editable.mockReturnValue(true);
    mocks.transaction.mockImplementation((callback: (tx: object) => unknown) =>
      callback({
        keywordResearchSnapshot: {
          findUniqueOrThrow: mocks.findUniqueOrThrow,
          updateMany: mocks.updateMany,
        },
      }),
    );
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "snapshot_1" });
  });

  it("does not write when the demo is disabled, the result is an estimate, or every source fails", async () => {
    mocks.editable.mockReturnValue(false);
    await expect(maybePersistKeywordResearchSnapshot(writeInput())).resolves.toBeNull();
    mocks.editable.mockReturnValue(true);
    await expect(
      maybePersistKeywordResearchSnapshot(writeInput({ outcome: { ...outcome, estimate: true } })),
    ).resolves.toBeNull();
    await expect(
      maybePersistKeywordResearchSnapshot(
        writeInput({ outcome: { ok: false, reason: "no_source" } }),
      ),
    ).resolves.toBeNull();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("stores sanitized partial or zero-row successes from the oldest source age", async () => {
    await maybePersistKeywordResearchSnapshot(
      writeInput({
        outcome: {
          ...outcome,
          rows: [],
          sources: [
            ...outcome.sources,
            {
              cached: false,
              costCents: 0,
              reason: "provider_error",
              returned: 0,
              source: "related" as const,
              status: "failed" as const,
            },
          ],
        },
        successfulFetchedAts: ["2026-08-10T12:00:00.000Z", outcome.fetchedAt],
      }),
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          freshUntil: new Date("2026-09-09T12:00:00.000Z"),
          rows: [],
        }),
      }),
    );

    mocks.updateMany.mockClear();
    await maybePersistKeywordResearchSnapshot(writeInput());
    const data = mocks.updateMany.mock.calls[0][0].data;
    expect(data.rows).toEqual([
      expect.not.objectContaining({
        alreadySaved: expect.anything(),
        alreadyTracked: expect.anything(),
      }),
    ]);
    expect(JSON.stringify(data)).not.toContain("connections");
  });
});
