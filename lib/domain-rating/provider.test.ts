import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDomainRating } from "./provider";

afterEach(() => vi.unstubAllGlobals());

describe("free domain rating provider", () => {
  it("requests only the free endpoint with an explicit stable rating version", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          domain_rating: {
            domain_rating: 0,
            license: "https://ahrefs.com/legal/domain-rating-license",
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await fetchDomainRating("example.com", "test-key")).toBe(0);
    const [url, options] = fetch.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.ahrefs.com/v3/public/domain-rating-free?target=example.com&version=dr3&output=json",
    );
    expect(options.headers.Authorization).toBe("Bearer test-key");
    expect(options.redirect).toBe("error");
  });

  it.each([null, -1, 101, "42"])(
    "rejects invalid rating %s instead of recording zero",
    async (rating) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ domain_rating: { domain_rating: rating } })),
          ),
      );
      await expect(fetchDomainRating("example.com", "test-key")).rejects.toThrow(
        "invalid_response",
      );
    },
  );

  it("never exposes a provider response or key in errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret body", { status: 401 })));
    await expect(fetchDomainRating("example.com", "test-key")).rejects.toThrow(/^authentication$/);
  });
});
