import { describe, expect, it, vi } from "vitest";
import { auditTargets, checkPageVitals, selectedTargets } from "./check";
import { fieldPayload } from "./client.fixtures";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("page vitals check", () => {
  it("stores both strategies and skips a URL that cannot be reached", async () => {
    const store = {
      pageVitals: { upsert: vi.fn(async () => ({})) },
      projectPage: { upsert: vi.fn(async () => ({ id: "page_created" })) },
    };
    const fetchMock = vi.fn(async (input: URL) => {
      if (input.searchParams.get("url")?.endsWith("/missing")) return response({}, 500);
      return response(fieldPayload);
    });
    const result = await checkPageVitals({
      apiKey: "test-key",
      fetch: fetchMock as typeof fetch,
      projectId: "project_1",
      store,
      targets: [
        { path: "/", url: "https://example.com/" },
        { path: "/missing", url: "https://example.com/missing" },
      ],
    });
    expect(result).toEqual({ checked: 2, code: "ok" });
    expect(store.projectPage.upsert).toHaveBeenCalled();
    expect(store.pageVitals.upsert).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(store.pageVitals.upsert.mock.calls)).not.toContain("test-key");
  });

  it("stops when the quota is hit and keeps readings already stored", async () => {
    const store = {
      pageVitals: { upsert: vi.fn(async () => ({})) },
      projectPage: { upsert: vi.fn(async () => ({ id: "page_1" })) },
    };
    let calls = 0;
    const result = await checkPageVitals({
      apiKey: "test-key",
      fetch: vi.fn(async () => {
        calls += 1;
        return calls === 1 ? response(fieldPayload) : response({}, 429);
      }) as typeof fetch,
      projectId: "project_1",
      store,
      targets: [{ pageId: "page_1", path: "/", url: "https://example.com/" }],
    });
    expect(result.code).toBe("quota");
    expect(result.checked).toBe(1);
  });

  it("keeps the audit sample at 15 and the page selection at 25", () => {
    const pages = Array.from({ length: 20 }, (_, index) => ({
      url: `https://example.com/p-${index}`,
    }));
    expect(auditTargets("example.com", pages)).toHaveLength(15);
    const selected = Array.from({ length: 30 }, (_, index) => ({
      id: `page_${index}`,
      path: `/p-${index}`,
    }));
    expect(
      selectedTargets(
        "example.com",
        selected,
        selected.map((page) => page.path),
      ),
    ).toHaveLength(25);
  });
});
