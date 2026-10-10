import { describe, expect, it, vi } from "vitest";
import type { LatestExecutedCheckInput, LatestSuccessfulCheckRecord } from "./keyword-check-state";
import { type KeywordRecord, keywordResource } from "./resources";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

type CheckFixture = LatestExecutedCheckInput & {
  previousPosition: number | null;
  rankingUrl: string | null;
};

const completedCheck: CheckFixture = {
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
const failedCheck: CheckFixture = {
  ...completedCheck,
  checkedAt: new Date("2026-09-04T00:00:00.000Z"),
  errorCode: "provider_billing",
  error: "Provider balance exhausted.",
  position: null,
  previousPosition: 6,
  publicId: "check_b00000000000000000000000",
  rankingUrl: null,
  status: "failed",
};
const projectPublicId = "prj_a00000000000000000000000";

function keywordRecord(check: CheckFixture): KeywordRecord {
  return {
    createdAt: new Date("2026-08-14T00:00:00.000Z"),
    device: "desktop",
    id: "keyword_1",
    intent: null,
    location: "United States",
    locationRef: { canonicalKey: "US", languageCode: "en", languageLabel: "English" },
    project: { defaults: null },
    publicId: "kw_a00000000000000000000000",
    rankChecks: [check],
    schedule: null,
    tags: [],
    targetUrl: null,
    text: "rank tracker",
    topic: null,
    updatedAt: new Date("2026-08-14T00:00:00.000Z"),
  } as unknown as KeywordRecord;
}

function latestSuccessfulRecord(check: CheckFixture): LatestSuccessfulCheckRecord {
  return {
    checkedAt: check.checkedAt,
    keywordId: "keyword_1",
    observationRun: check.observationRun,
    position: check.position,
    publicId: check.publicId,
    rankingUrl: check.rankingUrl,
    run: check.run,
  };
}

describe("keywordResource observation coverage", () => {
  it.each(["complete", "unknown", "truncated_by_stop_on_match", null] as const)(
    "preserves %s coverage for completed null and positive ranks",
    (completeness) => {
      for (const position of [null, 6]) {
        const observation = completeness === null ? {} : { observationRun: { completeness } };
        const check = { ...completedCheck, ...observation, position };
        const successful = latestSuccessfulRecord(check);
        const resource = keywordResource(keywordRecord(check), projectPublicId, {
          ...successful,
          ...observation,
        });

        expect(resource.latest_position).toBe(position);
        expect(resource.latest_check).toMatchObject({
          status: "completed",
          position,
          observation_completeness: completeness,
        });
        expect(resource.latest_successful_check).toMatchObject({
          position,
          observation_completeness: completeness,
        });
      }
    },
  );

  it("keeps the latest failure separate from the prior truncated positive observation", () => {
    const successful = latestSuccessfulRecord(completedCheck);
    const resource = keywordResource(keywordRecord(failedCheck), projectPublicId, {
      ...successful,
      observationRun: { completeness: "truncated_by_stop_on_match" },
    });

    expect(resource.latest_position).toBeNull();
    expect(resource.latest_check).toMatchObject({
      status: "failed",
      position: null,
      observation_completeness: null,
    });
    expect(resource.latest_successful_check).toMatchObject({
      position: 6,
      observation_completeness: "truncated_by_stop_on_match",
    });
  });
});
