import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
} from "@/lib/providers/model/transport.test-support";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { probe } from "./catalog";
import { canary, catalogFixture, context } from "./fixtures.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let network: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  network = interceptedFetch();
  vi.mocked(consumeProviderLimit).mockClear();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Documentation-derived page shape; IDs, counts and boundary failures are synthetic.
function page(ids: string[], more = false) {
  return {
    data: ids.map((id) => ({ ...catalogFixture().data[0], id })),
    has_more: more,
    first_id: ids[0] ?? null,
    last_id: ids.at(-1) ?? null,
  };
}
const selected = catalogFixture().data[0].id;
it.each(["first", "last"])("traverses two pages with the selected model %s", async (position) => {
  const ids = position === "first" ? [selected, "other"] : ["other", selected];
  network.mockResolvedValueOnce(json(JSON.stringify(page([ids[0]], true))));
  network.mockResolvedValueOnce(json(JSON.stringify(page([ids[1]]))));
  const result = await probe(context());
  expect(result.state).toBe("catalog_available");
  expect(result.catalog?.models.map((model) => model.modelId)).toEqual([selected]);
  expect(network.mock.calls.map(([url]) => String(url))).toEqual([
    "https://api.anthropic.com/v1/models?limit=1000",
    `https://api.anthropic.com/v1/models?after_id=${ids[0]}&limit=1000`,
  ]);
  for (const [, options] of network.mock.calls) {
    expect(options).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: { "x-api-key": canary, "anthropic-version": "2026-10-21" },
    });
    expect(options?.body).toBeUndefined();
  }
  expect(consumeProviderLimit).toHaveBeenCalledTimes(2);
});
it.each([false, true])(
  "accepts the terminal five-page limit, nonterminal=%s remains unavailable",
  async (more) => {
    for (let i = 0; i < 5; i++)
      network.mockResolvedValueOnce(
        json(JSON.stringify(page([i === 0 ? selected : `model-${i}`], i < 4 || more))),
      );
    expect((await probe(context())).state).toBe(more ? "unavailable" : "catalog_available");
    expect(network).toHaveBeenCalledTimes(5);
  },
);
it.each([false, true])(
  "accepts 1000 terminal models, nonterminal=%s remains unavailable",
  async (more) => {
    network.mockResolvedValueOnce(
      json(
        JSON.stringify(
          page([selected, ...Array.from({ length: 999 }, (_, i) => `model-${i}`)], more),
        ),
      ),
    );
    expect((await probe(context())).state).toBe(more ? "unavailable" : "catalog_available");
    expect(network).toHaveBeenCalledOnce();
  },
);
it.each(["repeated", "invalid-cursor", "aggregate-models", "aggregate-bytes", "http"])(
  "discards the catalog on later-page %s without retry",
  async (scenario) => {
    const first = JSON.stringify(page([selected], true));
    network.mockResolvedValueOnce(json(first));
    let second = page(["other"]);
    if (scenario === "repeated") second = page([selected], true);
    if (scenario === "invalid-cursor") second.last_id = "https://invalid.example/";
    if (scenario === "aggregate-models")
      second = page(Array.from({ length: 1000 }, (_, i) => `model-${i}`));
    const emptyPaddedPage = { ...second, padding: "" };
    const paddingBytes =
      1024 * 1024 -
      Buffer.byteLength(first) -
      Buffer.byteLength(JSON.stringify(emptyPaddedPage)) +
      1;
    const body =
      scenario === "aggregate-bytes" ? { ...second, padding: "x".repeat(paddingBytes) } : second;
    if (scenario === "aggregate-bytes") {
      expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(1024 * 1024);
      expect(Buffer.byteLength(first) + Buffer.byteLength(JSON.stringify(body))).toBe(
        1024 * 1024 + 1,
      );
    }
    network.mockResolvedValueOnce(
      json(JSON.stringify(body), { status: scenario === "http" ? 500 : 200 }),
    );
    expect(await probe(context())).toEqual({ state: "unavailable", catalog: null });
    expect(network).toHaveBeenCalledTimes(2);
  },
);
it("shares one deadline across pages and does not retry a hung later page", async () => {
  vi.useFakeTimers();
  network.mockImplementationOnce(async () => {
    await new Promise((resolve) => setTimeout(resolve, 70000));
    return json(JSON.stringify(page([selected], true)));
  });
  network.mockImplementationOnce(() => new Promise(() => {}));
  const pending = probe(context());
  await vi.advanceTimersByTimeAsync(120001);
  expect(await pending).toEqual({ state: "unavailable", catalog: null });
  expect(network).toHaveBeenCalledTimes(2);
});

it("does not publish a null-limit prefix when the next page fails", async () => {
  const first = page([selected], true);
  network.mockResolvedValueOnce(
    json(JSON.stringify({ ...first, data: [{ ...first.data[0], max_tokens: null }] })),
  );
  network.mockResolvedValueOnce(json("{}", { status: 500 }));
  expect(await probe(context())).toEqual({ state: "unavailable", catalog: null });
  expect(network).toHaveBeenCalledTimes(2);
});
