import { describe, expect, it } from "vitest";
import { estimateOnlyScope, scopeToEnforce } from "./estimate-only-scope";

const url = (search: string) => new URL(`https://example.test/api/v1/projects/prj_1${search}`);

function scope(input: {
  operationId: string;
  parsedBody?: unknown;
  search?: string;
  requiredScope?: "read" | "write" | "admin";
}) {
  return estimateOnlyScope({
    operationId: input.operationId,
    ...(input.parsedBody === undefined ? {} : { parsedBody: input.parsedBody }),
    requiredScope: input.requiredScope ?? "write",
    url: url(input.search ?? ""),
  });
}

describe("estimateOnlyScope", () => {
  it("downgrades the two GET operations only for the exact query flag", () => {
    for (const operationId of ["analyzeBacklinks", "researchKeywords"]) {
      expect(scope({ operationId, search: "?estimate_only=true" })).toBe("read");
      expect(scope({ operationId, search: "?target=example.com&estimate_only=true" })).toBe("read");
    }
  });

  it.each([
    "estimate_only=1",
    "estimate_only=TRUE",
    "estimate_only=yes",
    "estimate_only=",
    "estimate_only=truee",
    "estimate_only=false",
    "estimate_only=1&estimate_only=true",
    "",
  ])("keeps the declared scope for the query value %s", (search) => {
    for (const operationId of ["analyzeBacklinks", "researchKeywords"]) {
      expect(scope({ operationId, search: `?${search}` })).toBe("write");
    }
  });

  it("downgrades the POST operation only for a boolean body flag", () => {
    expect(
      scope({ operationId: "analyzeDomainOverview", parsedBody: { estimate_only: true } }),
    ).toBe("read");
    expect(
      scope({
        operationId: "analyzeDomainOverview",
        parsedBody: { estimate_only: true, max_cost_cents: 0 },
      }),
    ).toBe("read");
  });

  it.each([
    ["string flag", { estimate_only: "true" }],
    ["numeric flag", { estimate_only: 1 }],
    ["false flag", { estimate_only: false }],
    ["missing flag", { max_cost_cents: 0 }],
    ["array body", [{ estimate_only: true }]],
  ])("keeps the declared scope for the body %s", (_case, parsedBody) => {
    expect(
      scope({ operationId: "analyzeDomainOverview", parsedBody, requiredScope: "write" }),
    ).toBe("write");
  });

  it("keeps the declared scope for every other operation", () => {
    expect(scope({ operationId: "loadMoreBacklinkRows", search: "?estimate_only=true" })).toBe(
      "write",
    );
    expect(
      scope({ operationId: "listKeywords", search: "?estimate_only=true", requiredScope: "read" }),
    ).toBe("read");
  });
});

describe("scopeToEnforce", () => {
  it("reads the POST body from a clone so the handler can still read it", async () => {
    const body = { estimate_only: true, language_code: "en", location_code: 2840 };
    const request = new Request("https://example.test/api/v1/projects/prj_1/backlinks", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(
      await scopeToEnforce(
        { operationId: "analyzeDomainOverview", requiredScope: "write" },
        request,
        new URL(request.url),
      ),
    ).toBe("read");
    await expect(request.json()).resolves.toEqual(body);
  });

  it("keeps the declared scope for a body that is not valid JSON", async () => {
    const request = new Request("https://example.test/api/v1/projects/prj_1/backlinks", {
      body: "not json",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(
      await scopeToEnforce(
        { operationId: "analyzeDomainOverview", requiredScope: "write" },
        request,
        new URL(request.url),
      ),
    ).toBe("write");
  });

  it("never reads the request body for GET or non-estimate operations", async () => {
    const get = new Request(
      "https://example.test/api/v1/projects/prj_1/backlinks?estimate_only=true",
    );
    expect(
      await scopeToEnforce(
        { operationId: "analyzeBacklinks", requiredScope: "write" },
        get,
        new URL(get.url),
      ),
    ).toBe("read");

    const post = new Request("https://example.test/api/v1/projects/prj_1/backlinks/rows", {
      body: JSON.stringify({ limit: 100 }),
      method: "POST",
    });
    expect(
      await scopeToEnforce(
        { operationId: "loadMoreBacklinkRows", requiredScope: "write" },
        post,
        new URL(post.url),
      ),
    ).toBe("write");
    await expect(post.json()).resolves.toEqual({ limit: 100 });
  });
});
