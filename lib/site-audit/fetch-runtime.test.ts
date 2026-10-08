import { Agent, MockAgent } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite } from "./crawl";
import { fetchAuditPage } from "./fetch";

afterEach(() => vi.restoreAllMocks());

function offlineReplies() {
  const agent = new Agent();
  // Keep the mock's backing agent independent of the pinned-agent dispatch spy.
  agent.dispatch = agent.dispatch.bind(agent);
  const replies = new MockAgent({ agent });
  replies.disableNetConnect();
  return replies;
}

describe("site audit dispatcher runtime compatibility", () => {
  it("fetches with the installed Agent protocol rather than Node's bundled fetch protocol", async () => {
    const replies = offlineReplies();
    replies
      .get("https://example.com")
      .intercept({ path: "/", method: "GET" })
      .reply(200, "<html><title>Example</title><h1>Example</h1></html>", {
        headers: { "content-type": "text/html" },
      });
    const dispatch = vi
      .spyOn(Agent.prototype, "dispatch")
      .mockImplementation((options, handler) => {
        // Exercise the actual fetch handler contract, which changed between bundled Undici 6 and 8.
        expect(handler.onRequestStart).toBeTypeOf("function");
        return replies.dispatch(options, handler);
      });
    try {
      const result = await fetchAuditPage(
        new URL("https://example.com/"),
        {
          deadline: Date.now() + 15000,
          requests: 0,
          origin: "https://example.com",
          signal: AbortSignal.timeout(15000),
        },
        { resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] },
      );
      expect(result.status).toBe(200);
      expect(result.html).toContain("<h1>Example</h1>");
      expect(result.headers).toBeInstanceOf(Headers);
      expect(dispatch).toHaveBeenCalledOnce();
      replies.assertNoPendingInterceptors();
    } finally {
      await replies.close();
    }
  });

  it("crawls robots and HTML through the default client without placeholder fetch failures", async () => {
    const replies = offlineReplies();
    const origin = replies.get("https://example.com");
    origin
      .intercept({ path: "/robots.txt", method: "GET" })
      .reply(200, "User-agent: *\nAllow: /\n");
    origin
      .intercept({ path: "/", method: "GET" })
      .reply(
        200,
        '<html><title>Example</title><meta name="description" content="Example"><h1>Example</h1></html>',
        { headers: { "content-type": "text/html" } },
      );
    vi.spyOn(Agent.prototype, "dispatch").mockImplementation((options, handler) =>
      replies.dispatch(options, handler),
    );
    try {
      const result = await crawlSite("example.com", 1, {
        resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
      });
      expect(result.state).toBe("complete");
      expect(result.requests).toBe(2);
      expect(result.pages[0]).toMatchObject({
        status: 200,
        title: "Example",
        h1Count: 1,
        indexable: true,
      });
      expect(result.summary).toMatchObject({ errors: 0, pages: 1, indexable: 1 });
      replies.assertNoPendingInterceptors();
    } finally {
      await replies.close();
    }
  });
});
