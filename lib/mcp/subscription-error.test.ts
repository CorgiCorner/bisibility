import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { errorToolResult, restFailureToolError } from "./result";

const problem = {
  type: "https://bisibility.com/problems/subscription-required",
  code: "subscription_required",
  status: 403,
  title: "Paid access required",
  detail: "Paid access is required for this operation.",
  subscriptionRequired: true,
  docs_url: "https://bisibility.com/docs/api/errors#subscription-required",
};

describe("subscription_required MCP tool error", () => {
  it("preserves the code and payload in structured and text results", () => {
    const result = errorToolResult(restFailureToolError(problem, 403));
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error).toMatchObject({
      code: "subscription_required",
      message: expect.stringContaining("Paid access is required"),
      payload: problem,
      status: 403,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  });

  it.each([
    [problem, 402],
    [problem, undefined],
    [{ ...problem, type: "https://bisibility.com/problems/forbidden" }, 403],
    [{ ...problem, type: "https://example.com/problems/subscription-required" }, 403],
    [{ code: "subscription_required", subscriptionRequired: true }, 403],
    [[problem], 403],
    [null, 403],
  ])("does not classify other failures as subscription errors", (payload, status) => {
    expect(restFailureToolError(payload, status)).toEqual({
      message: "bisibility API request failed.",
      payload,
      status,
    });
  });
});
