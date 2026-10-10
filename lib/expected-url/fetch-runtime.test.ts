import tls from "node:tls";
import { Agent, MockAgent } from "undici";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicDocument } from "./public-document-fetch";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public document installed transport compatibility", () => {
  it("uses the installed Undici handler protocol for public redirects", async () => {
    const backing = new Agent();
    backing.dispatch = backing.dispatch.bind(backing);
    const replies = new MockAgent({ agent: backing });
    replies.disableNetConnect();
    replies
      .get("https://example.com")
      .intercept({ path: "/", method: "GET" })
      .reply(301, "", { headers: { location: "https://www.example.com/page" } });
    replies
      .get("https://www.example.com")
      .intercept({ path: "/page", method: "GET" })
      .reply(200, "<html>Example</html>", { headers: { "content-type": "text/html" } });
    const dispatch = vi
      .spyOn(Agent.prototype, "dispatch")
      .mockImplementation((options, handler) => {
        expect(handler.onRequestStart).toBeTypeOf("function");
        return replies.dispatch(options, handler);
      });
    const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Node bundled fetch is incompatible with the installed dispatcher");
      }),
    );
    try {
      await expect(
        fetchPublicDocument({
          url: "https://example.com/",
          lookup,
          maxBytes: 1024,
          timeoutMs: 1000,
        }),
      ).resolves.toMatchObject({
        body: "<html>Example</html>",
        url: "https://www.example.com/page",
      });
      expect(lookup.mock.calls).toHaveLength(2);
      expect(dispatch).toHaveBeenCalledTimes(2);
      replies.assertNoPendingInterceptors();
    } finally {
      await replies.close();
    }
  });
  it("passes only preflight-vetted DNS answers to the actual TLS connector", async () => {
    const connect = vi.spyOn(tls, "connect").mockImplementation(() => {
      throw new Error("offline connector boundary reached");
    });
    const lookup = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    await expect(
      fetchPublicDocument({ url: "https://example.com/", lookup, maxBytes: 1024, timeoutMs: 1000 }),
    ).rejects.toThrow();
    expect(connect).toHaveBeenCalledOnce();
    const options = connect.mock.calls[0][0] as unknown as tls.ConnectionOptions;
    expect(options.servername).toBe("example.com");
    expect(options.lookup).toBeTypeOf("function");
    const pinned = options.lookup as unknown as (
      hostname: string,
      options: { all?: boolean },
      callback: (...args: unknown[]) => void,
    ) => void;
    const all = vi.fn();
    pinned("example.com", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const single = vi.fn();
    pinned("example.com", {}, single);
    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(lookup).toHaveBeenCalledOnce();
  });
});
