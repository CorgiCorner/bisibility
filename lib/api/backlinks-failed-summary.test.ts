import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBacklinks } from "./backlinks";
import {
  expectedFailedSummaryDetails,
  failedSummaryApiContext,
  failedSummaryFixture,
  failedSummaryProjectId,
} from "./backlinks-failed-summary.test-fixture";

const mocks = vi.hoisted(() => ({ analyze: vi.fn() }));
vi.mock("@/lib/backlinks/service", () => ({ analyzeBacklinks: mocks.analyze }));

describe("backlinks failed summary REST evidence", () => {
  beforeEach(() => mocks.analyze.mockReset());

  it("keeps a failed HTTP problem with unknown total and completed summary evidence", async () => {
    mocks.analyze.mockResolvedValue(failedSummaryFixture);
    const response = await getBacklinks(failedSummaryApiContext(), failedSummaryProjectId);
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(response.headers.get("RateLimit-Remaining")).toBe("99");
    const body = await response.json();
    expect(body).toMatchObject({
      type: "https://bisibility.com/problems/internal_server_error",
      status: 500,
      details: expectedFailedSummaryDetails,
    });
    expect(body).not.toHaveProperty("data");
    expect(body.details).not.toHaveProperty("cached");
    expect(body.details).not.toHaveProperty("rows");
  });

  it("projects only public evidence fields even when internal properties are present", async () => {
    mocks.analyze.mockResolvedValue({
      ...failedSummaryFixture,
      attemptId: "private-attempt",
      credentials: "private-credential",
      cause: { message: "private-provider-error" },
      summary: { ...failedSummaryFixture.summary, raw: "private-provider-payload" },
      historyFailure: {
        ...failedSummaryFixture.historyFailure,
        attemptId: "private-attempt",
        message: "private-provider-error",
      },
    });
    const response = await getBacklinks(failedSummaryApiContext(), failedSummaryProjectId);
    const body = await response.json();
    expect(body.details).toEqual(expectedFailedSummaryDetails);
    expect(JSON.stringify(body)).not.toContain("private-");
  });
});
