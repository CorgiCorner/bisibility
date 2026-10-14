import { definitionSourceFixture } from "@/lib/measurement-definitions/fixtures";
import type { SerpRankInput } from "@/lib/providers/types";
import { serpRankLocation } from "@/lib/serp/location";
import { afterEach, expect, it, vi } from "vitest";
import { fetchSerpApiSnapshotPage } from "./serpapi-snapshot";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./serpapi-request", async () => ({
  ...(await vi.importActual<typeof import("./serpapi-request")>("./serpapi-request")),
  requestJson: mocks.request,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  mocks.request.mockReset();
});
it("the extra page uses original semantics and keeps its own observed time/scope; it never enlarges the old prefix", async () => {
  vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "0");
  const source = definitionSourceFixture();
  const location = serpRankLocation(source.target.location);
  const context = {
    version: 1 as const,
    capturedAt: new Date(Date.now() - 1000).toISOString(),
    keyword: source.target.text,
    domain: "example.test",
    device: "desktop" as const,
    location,
    nextStart: 20,
    ended: false,
    connectionId: "original-connection",
  };
  mocks.request.mockResolvedValue({
    organic_results: [{ position: 1, link: "https://example.test/actual" }],
    search_metadata: { processed_at: "2026-10-02 10:00:00 UTC" },
    serpapi_pagination: { next: "https://untrusted.invalid/never-follow" },
  });
  const input = {
    keyword: "today-changed",
    device: "mobile",
    domain: "today.test",
    location,
    credentials: { apiKey: "synthetic" },
  } as SerpRankInput;
  const result = await fetchSerpApiSnapshotPage(input, context, 20);
  const url = new URL(mocks.request.mock.calls[0][0]);
  expect(url.searchParams.get("q")).toBe(context.keyword);
  expect(url.searchParams.get("start")).toBe("20");
  expect(result.raw).toMatchObject({
    snapshotPageEvidence: {
      requestDepth: 10,
      nextStart: 20,
      completeThrough: null,
      completeness: "unknown",
      effectiveScope: null,
    },
    snapshotContinuation: { keyword: context.keyword, domain: context.domain },
  });
  expect(result).not.toHaveProperty("observation");
  expect(mocks.request).toHaveBeenCalledOnce();
});
it("fake mode refuses continuation before any real transport rather than silently using synthetic credentials against a provider", async () => {
  vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
  await expect(fetchSerpApiSnapshotPage({} as SerpRankInput, {} as never, 20)).rejects.toThrow(
    "explicit synthetic adapter",
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
