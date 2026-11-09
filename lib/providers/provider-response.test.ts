import { expect, it } from "vitest";
import { captureHttpResponse, redactProviderResponse } from "./provider-response";

it("redacts nested credentials and signed access links without dropping provider content", () => {
  const accessUrl = new URL("https://example.com/result?q=coffee");
  accessUrl.username = "user";
  accessUrl.password = "secret";
  accessUrl.searchParams.set("api_key", "secret");
  const source = {
    api_key: "secret",
    request: { headers: { Authorization: "secret" } },
    next: accessUrl.href,
    results: [{ title: "Coffee", score: 42 }],
    ai_overview: { text: "Summary", page_token: "secret" },
  };
  const safe = redactProviderResponse(source);
  expect(JSON.stringify(safe)).not.toContain("secret");
  expect(safe).toMatchObject({
    results: [{ title: "Coffee", score: 42 }],
    ai_overview: { text: "Summary" },
  });
  expect(source.api_key).toBe("secret");
});

it("preserves native URL spelling when no access data needs removal", () => {
  const native = { url: "https://example.com", query: "https://example.com/?q=coffee%20shop" };
  expect(redactProviderResponse(native)).toEqual(native);
});

it("keeps large analytics pages complete while redacting credentials", () => {
  const rows = Array.from({ length: 25000 }, (_, index) => ({
    keys: [String(index), "page"],
    clicks: index,
    impressions: index * 10,
  }));
  const output = redactProviderResponse({ rows, token: "secret" }) as {
    rows: typeof rows;
    token: string;
  };
  expect(output.rows).toEqual(rows);
  expect(output.token).toBe("[redacted]");
});

it("captures non-JSON failures without consuming the response body", async () => {
  const response = new Response("provider unavailable", { status: 503 });
  let saved: unknown;
  await captureHttpResponse(response, async (status, body) => {
    saved = { status, body };
  });
  expect(saved).toEqual({ status: 503, body: "provider unavailable" });
  expect(await response.text()).toBe("provider unavailable");
});
it("redacts credentials echoed inside provider messages", () => {
  expect(
    redactProviderResponse({
      message: "Failed https://provider.example/path?api_key=secret and Bearer tokenvalue123",
    }),
  ).toEqual({
    message: "Failed https://provider.example/path?api_key=%5Bredacted%5D and Bearer [redacted]",
  });
});

it("respects the adapter response limit without retaining a truncated success", async () => {
  let called = false;
  await expect(
    captureHttpResponse(
      new Response("a".repeat(100)),
      async () => {
        called = true;
      },
      "",
      10,
    ),
  ).rejects.toThrow("capture limit");
  expect(called).toBe(false);
});
