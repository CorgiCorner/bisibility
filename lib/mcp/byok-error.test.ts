import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { restFailureToolError } from "./result";

const problem = {
  detail:
    "This account runs paid provider work only on its own provider keys. Connect your own DataForSEO key in the project's provider settings to run keyword research.",
  details: { capability: "keyword_research", provider: "dataforseo" },
  status: 403,
  title: "Own provider key required",
  type: "https://bisibility.com/problems/byok_required",
};

describe("byok_required MCP tool error", () => {
  it("tells the agent which key to connect", () => {
    expect(restFailureToolError(problem, 403)).toEqual({
      code: "byok_required",
      message: problem.detail,
      payload: problem,
      status: 403,
    });
  });

  it("falls back to a fixed sentence without a detail", () => {
    const { detail: _detail, ...bare } = problem;
    expect(restFailureToolError(bare, 403)).toMatchObject({
      code: "byok_required",
      message: expect.stringContaining("Integrations settings on the web"),
    });
  });

  it("keeps an ordinary 403 generic", () => {
    const forbidden = { ...problem, type: "https://bisibility.com/problems/forbidden" };
    expect(restFailureToolError(forbidden, 403)).not.toMatchObject({ code: "byok_required" });
  });
});
