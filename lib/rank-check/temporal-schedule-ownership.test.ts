import { describe, expect, it } from "vitest";
import { classifyRankCheckSchedule } from "./temporal-schedule-ownership";

function description(overrides: Record<string, unknown> = {}) {
  const typedSearchAttributes = {
    getAll: () => [
      { key: { name: "keywordId" }, value: "keyword_1" },
      { key: { name: "projectId" }, value: "project_1" },
    ],
  };
  return {
    action: {
      args: [{ keywordId: "keyword_1" }],
      typedSearchAttributes,
      workflowId: "rank-check-keyword_1",
      workflowType: "rankCheckWorkflow",
    },
    memo: { kind: "rank-check", keywordId: "keyword_1", projectId: "project_1" },
    scheduleId: "rank-check-keyword_1",
    state: { paused: false },
    typedSearchAttributes,
    ...overrides,
  };
}

describe("classifyRankCheckSchedule", () => {
  it("requires every available exact ownership invariant", () => {
    expect(classifyRankCheckSchedule(description() as never)).toEqual({
      classification: "owned",
      keywordId: "keyword_1",
      projectId: "project_1",
      reason: "exact-owned-rank-check-schedule",
    });
  });

  it("rejects ambiguous prefix matches without touching them", () => {
    expect(
      classifyRankCheckSchedule(
        description({
          action: {
            args: [{ keywordId: "keyword_2" }],
            workflowId: "rank-check-keyword_1",
            workflowType: "rankCheckWorkflow",
          },
        }) as never,
      ),
    ).toMatchObject({ classification: "ambiguous", reason: "action-keyword-mismatch" });
  });

  it("rejects a Schedule-level and action-level keyword mismatch", () => {
    expect(
      classifyRankCheckSchedule(
        description({
          typedSearchAttributes: {
            getAll: () => [
              { key: { name: "keywordId" }, value: "keyword_2" },
              { key: { name: "projectId" }, value: "project_1" },
            ],
          },
        }) as never,
      ),
    ).toMatchObject({ classification: "ambiguous" });
  });

  it("requires decodable keyword and project attributes at both levels", () => {
    expect(
      classifyRankCheckSchedule(description({ typedSearchAttributes: undefined }) as never),
    ).toMatchObject({ classification: "ambiguous" });
    expect(
      classifyRankCheckSchedule(
        description({
          action: {
            args: [{ keywordId: "keyword_1" }],
            workflowId: "rank-check-keyword_1",
            workflowType: "rankCheckWorkflow",
          },
        }) as never,
      ),
    ).toMatchObject({ classification: "ambiguous" });
  });

  it("rejects duplicate search attributes as contradictory evidence", () => {
    expect(
      classifyRankCheckSchedule(
        description({
          typedSearchAttributes: {
            getAll: () => [
              { key: { name: "keywordId" }, value: "keyword_1" },
              { key: { name: "keywordId" }, value: "keyword_2" },
              { key: { name: "projectId" }, value: "project_1" },
            ],
          },
        }) as never,
      ),
    ).toMatchObject({ classification: "ambiguous" });
  });

  it("does not classify the reconciler singleton as an owned keyword Schedule", () => {
    expect(
      classifyRankCheckSchedule(description({ scheduleId: "rank-check-reconciler" }) as never),
    ).toMatchObject({ classification: "singleton" });
  });

  it("excludes the dispatcher singleton from the unrelated Schedule hash", () => {
    expect(
      classifyRankCheckSchedule(description({ scheduleId: "dispatcher-rank-checks" }) as never),
    ).toMatchObject({ classification: "dispatcher-singleton" });
  });

  it("leaves unrelated system Schedules outside the owned set", () => {
    expect(
      classifyRankCheckSchedule(description({ scheduleId: "maintenance-audit-purge" }) as never),
    ).toMatchObject({ classification: "unrelated" });
  });
});
