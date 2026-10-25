import { expect, it, vi } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { type RankCheckRecord, rankCheckResource } from "./resources";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
it.each(["partial", "unresolved", "complete"])(
  "RE-8 API distinguishes %s retained no-match and suppresses comparison",
  (completeness) => {
    const check = {
      id: "check",
      publicId: "check_a00000000000000000000000",
      keyword: { projectId: "project", publicId: "kw_a00000000000000000000000" },
      checkedAt: new Date("2026-10-24T00:00:00Z"),
      provider: "dataforseo",
      status: completeness === "complete" ? "completed" : "failed",
      attempts: null,
      billingUnits: null,
      costCents: null,
      error: null,
      errorCode: null,
      observationRun: null,
      position: null,
      previousPosition: null,
      rankingUrl: null,
      run: null,
      raw: {
        recovery: {
          completeness,
          returnedDepth: completeness === "complete" ? 100 : 20,
          comparisonAllowed: false,
        },
      },
    } as unknown as RankCheckRecord;
    expect(rankCheckResource(check)).toMatchObject({
      position: null,
      result_completeness: completeness,
      returned_depth: completeness === "complete" ? 100 : 20,
      comparison_allowed: false,
    });
    const schema = getOpenApiDocument().components.schemas.RankCheck;
    expect(schema.properties.result_completeness.enum).toContain(completeness);
    expect(schema.required).not.toContain("result_completeness");
  },
);
