import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { keywordResource, type RankCheckRecord, rankCheckResource } from "./resources";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { rankCheck: { findMany: vi.fn().mockResolvedValue([]) } },
}));

function keywordRecord(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-08-14T00:00:00.000Z"),
    device: "desktop",
    id: "keyword_1",
    intent: null,
    location: "United States",
    locationRef: {
      canonicalKey: "US",
      languageCode: "en",
      languageLabel: "English",
    },
    project: { defaults: null },
    publicId: "kw_a00000000000000000000000",
    rankChecks: [],
    schedule: null,
    tags: [],
    targetUrl: null,
    text: "rank tracker",
    topic: null,
    updatedAt: new Date("2026-08-14T00:00:00.000Z"),
    ...overrides,
  } as never;
}

const completedCheck = {
  checkedAt: new Date("2026-08-24T00:00:00.000Z"),
  errorCode: null,
  error: null,
  position: 6,
  previousPosition: 8,
  publicId: "check_a00000000000000000000000",
  rankingUrl: "https://example.com/rank-tracker",
  run: { publicId: "rcr_a00000000000000000000000" },
  status: "completed",
};

const failedCheck = {
  checkedAt: new Date("2026-09-04T00:00:00.000Z"),
  errorCode: "provider_billing",
  error: "Provider balance exhausted.",
  position: null,
  previousPosition: 6,
  publicId: "check_b00000000000000000000000",
  rankingUrl: null,
  run: { publicId: "rcr_a00000000000000000000000" },
  status: "failed",
};

const notRankedCheck = {
  ...completedCheck,
  position: null,
  publicId: "check_c00000000000000000000000",
  rankingUrl: null,
};

function latestSuccessfulRecord(
  check: typeof completedCheck | typeof failedCheck | typeof notRankedCheck | null,
) {
  if (!check) {
    return null;
  }
  return {
    checkedAt: check.checkedAt,
    keywordId: "keyword_1",
    position: check.position,
    publicId: check.publicId,
    rankingUrl: check.rankingUrl,
    run: check.run,
  };
}

const projectPublicId = "prj_a00000000000000000000000";

describe("keywordResource check state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the failed latest check and the last known ranking separately", () => {
    const resource = keywordResource(
      keywordRecord({ rankChecks: [failedCheck] }),
      projectPublicId,
      latestSuccessfulRecord(completedCheck),
    );

    expect(resource).toMatchObject({
      latest_check: {
        checked_at: "2026-09-04T00:00:00.000Z",
        error: "Provider balance exhausted.",
        error_code: "provider_billing",
        id: "check_b00000000000000000000000",
        position: null,
        run_id: "rcr_a00000000000000000000000",
        status: "failed",
      },
      latest_position: null,
      latest_successful_check: {
        checked_at: "2026-08-24T00:00:00.000Z",
        id: "check_a00000000000000000000000",
        position: 6,
        ranking_url: "https://example.com/rank-tracker",
        run_id: "rcr_a00000000000000000000000",
      },
    });
  });

  it("keeps a completed not-ranked check distinct from an unknown one", () => {
    const resource = keywordResource(
      keywordRecord({ rankChecks: [notRankedCheck] }),
      projectPublicId,
      latestSuccessfulRecord(notRankedCheck),
    );

    expect(resource.latest_check).toMatchObject({ status: "completed", position: null });
    expect(resource.latest_successful_check).toMatchObject({ position: null });
  });

  it("omits both check-state objects when the keyword has no checks", () => {
    const resource = keywordResource(keywordRecord(), projectPublicId, null);

    expect(resource.latest_check).toBeNull();
    expect(resource.latest_successful_check).toBeNull();
    expect(resource.latest_position).toBeNull();
  });
});

describe("keywordResource schedule source", () => {
  it("reports project_default when the keyword has no schedule row", () => {
    const resource = keywordResource(
      keywordRecord({
        project: {
          defaults: {
            cronExpression: null,
            frequency: "daily",
            jitterMinutes: 60,
            lastCheckedAt: null,
            nextCheckAt: null,
            timezone: "UTC",
          },
        },
      }),
      projectPublicId,
    );

    expect(resource.schedule).toMatchObject({ frequency: "daily", source: "project_default" });
  });

  it("reports keyword when the keyword has its own schedule row", () => {
    const resource = keywordResource(
      keywordRecord({
        schedule: {
          cronExpression: null,
          frequency: "weekly",
          jitterMinutes: 30,
          lastCheckedAt: null,
          nextCheckAt: null,
          timezone: "UTC",
        },
      }),
      projectPublicId,
    );

    expect(resource.schedule).toMatchObject({ frequency: "weekly", source: "keyword" });
  });
});

function checkRecord(run: Record<string, unknown> | null) {
  return {
    attempts: null,
    checkedAt: new Date("2026-09-05T12:00:00.000Z"),
    costCents: null,
    error: "Provider balance exhausted.",
    errorCode: "provider_billing",
    id: "rank-check-1",
    keyword: { projectId: "project-1", publicId: "kw_a00000000000000000000000" },
    position: 4,
    previousPosition: 7,
    provider: "primary",
    publicId: "check_a00000000000000000000000",
    rankingUrl: "https://example.com/rank-tracker",
    raw: null,
    run,
    status: "failed",
  } as unknown as RankCheckRecord;
}

describe("rankCheckResource", () => {
  it.each([0, 1, 2, null])(
    "exposes measured quota quantity %s without deriving it from depth",
    (billingUnits) => {
      const resource = rankCheckResource({
        ...checkRecord(null),
        provider: "serpapi",
        billingUnits,
      });
      expect(resource.usage).toEqual({
        quantity: billingUnits,
        unit: "operations",
        status: billingUnits === null ? "unconfirmed" : "confirmed",
      });
    },
  );
  it("exposes the public run ID and preserves null for legacy checks", () => {
    expect(
      rankCheckResource(checkRecord({ publicId: "rcr_a00000000000000000000000" })),
    ).toMatchObject({
      run_id: "rcr_a00000000000000000000000",
    });
    expect(rankCheckResource(checkRecord(null))).toMatchObject({ run_id: null, run: null });
  });

  it("returns the error code and the joined run for a failed row", () => {
    const resource = rankCheckResource(
      checkRecord({
        finishedAt: new Date("2026-09-05T12:05:00.000Z"),
        publicId: "rcr_a00000000000000000000000",
        startedAt: new Date("2026-09-05T12:00:00.000Z"),
        status: "completed",
        trigger: "api",
      }),
    );

    expect(resource).toMatchObject({
      error: "Provider balance exhausted.",
      error_code: "provider_billing",
      run: {
        finished_at: "2026-09-05T12:05:00.000Z",
        id: "rcr_a00000000000000000000000",
        started_at: "2026-09-05T12:00:00.000Z",
        status: "completed",
        trigger: "api",
      },
    });
  });

  it("applies an explicit accounting override over the stored fields", () => {
    const resource = rankCheckResource(
      {
        ...checkRecord(null),
        provider: "serpapi",
        billingUnits: 1,
        costCents: new Prisma.Decimal(0.625),
      },
      { costCents: 1.5, usageQuantity: 3 },
    );
    expect(resource.cost_cents).toBe(1.5);
    expect(resource.usage).toEqual({
      quantity: 3,
      status: "confirmed",
      unit: "operations",
    });
  });

  it("keeps an unknown accounting override null instead of the stored values", () => {
    const resource = rankCheckResource(
      {
        ...checkRecord(null),
        provider: "serpapi",
        billingUnits: 3,
        costCents: new Prisma.Decimal(2),
      },
      { costCents: null, usageQuantity: null },
    );
    expect(resource.cost_cents).toBeNull();
    expect(resource.usage).toEqual({
      quantity: null,
      status: "unconfirmed",
      unit: "operations",
    });
  });
});
