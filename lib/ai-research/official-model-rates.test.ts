import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expandedFixture, expandedSelection } from "./official-model-expanded.test-support";
import { parseOfficialModelRates as parseWithRenderer } from "./official-model-rate-data";
import { fetchOfficialModelRates } from "./official-model-rates";
import {
  fixtureBodies,
  fixtureDescriptor,
  fixtureOrigin,
  fixturePaths,
  fixturePricing,
  fixtureRenderer,
  fixtureTable,
} from "./official-model-rates.test-support";

const provenance = {
  checkedAt: "2026-10-06T10:00:00.000Z",
  sourceUrl: `${fixtureOrigin}${fixturePaths[3]}`,
  limitsSourceUrl: `${fixtureOrigin}${fixturePaths[2]}`,
  currencySourceUrl: `${fixtureOrigin}${fixturePaths[1]}`,
};
function transport(bodies = fixtureBodies) {
  const fetcher = vi.fn(async (url: string) => {
    const index = fixturePaths.findIndex((path) => url === `${fixtureOrigin}${path}`);
    if (index < 0) throw new Error("Unrecognized public URL");
    return new Response(bodies[index]);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe("fresh official model source", () => {
  it("retains literal pricing contracts after production SWC minification", async () => {
    const swc = await import("next/dist/build/swc");
    await swc.loadBindings();
    const filename = "lib/ai-research/official-model-rate-data.ts";
    const source = await readFile(filename, "utf8");
    const transformed = await swc.transform(source, {
      filename,
      jsc: { parser: { syntax: "typescript" }, target: "es2022" },
      module: { type: "commonjs" },
    });
    const minified = await swc.minify(transformed.code, { compress: true, mangle: true });
    const literalFile = "lib/ai-research/official-model-literals.ts";
    const literalOutput = await swc.transform(await readFile(literalFile, "utf8"), {
      filename: literalFile,
      jsc: { parser: { syntax: "typescript" }, target: "es2022" },
      module: { type: "commonjs" },
    });
    const literalMinified = await swc.minify(literalOutput.code, { compress: true, mangle: true });
    const literals = { exports: {} };
    new Script(literalMinified.code).runInNewContext(literals, { timeout: 1000 });
    const context = {
      exports: { parseOfficialModelRates: parseWithRenderer },
      require: (path: string) => {
        if (path !== "./official-model-literals") throw new Error("Unexpected compiled dependency");
        return literals.exports;
      },
    };
    // Execute only this repository's compiled parser; provider JavaScript stays literal data.
    new Script(minified.code).runInNewContext(context, { timeout: 1000 });
    expect([
      ...context.exports.parseOfficialModelRates(
        fixtureDescriptor,
        fixturePricing(),
        provenance,
        fixtureRenderer,
      ),
    ]).toEqual([
      ...parseWithRenderer(fixtureDescriptor, fixturePricing(), provenance, fixtureRenderer),
    ]);
    const expanded = expandedFixture();
    const minifiedRates = context.exports.parseOfficialModelRates(
      expanded.descriptor,
      expanded.pricing,
      provenance,
      fixtureRenderer,
      expandedSelection,
    );
    expect(minifiedRates.size).toBe(45);
    expect([...minifiedRates]).toEqual([
      ...parseWithRenderer(
        expanded.descriptor,
        expanded.pricing,
        provenance,
        fixtureRenderer,
        expandedSelection,
      ),
    ]);
  });
  it("reads four bounded public GETs and retains separate price/limit provenance", async () => {
    const fetcher = transport();
    const before = Date.now();
    const rates = await fetchOfficialModelRates(before + 30_000);
    expect([...rates.keys()]).toEqual([
      "gpt-4.1-mini",
      "gpt-4.1-mini-2025-04-14",
      "gpt-4.1-nano",
      "gpt-4.1-nano-2025-04-14",
    ]);
    expect(rates.get("gpt-4.1-mini")).toMatchObject({
      inputUsdPerMillion: 0.7,
      outputUsdPerMillion: 3.5,
      contextTokens: 900000,
      maxOutputTokens: 28000,
      sourceUrl: provenance.sourceUrl,
      limitsSourceUrl: provenance.limitsSourceUrl,
    });
    expect(Date.parse(rates.get("gpt-4.1-mini")?.checkedAt ?? "")).toBeGreaterThanOrEqual(before);
    expect(rates.get("gpt-4.1-mini")).not.toHaveProperty("webSearchMaxCostCents");
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [, options] of fetcher.mock.calls as unknown as [string, RequestInit][]) {
      expect(options).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.headers).toBeUndefined();
    }
  });
  it("uses changing source prices instead of a curated table or batch price", () => {
    const table = fixtureTable();
    table.subsections[0].items[0].values.main.input = 8.75;
    const rates = parseWithRenderer(
      fixtureDescriptor,
      fixturePricing(table),
      provenance,
      fixtureRenderer,
    );
    expect(rates.get("gpt-4.1-mini")?.inputUsdPerMillion).toBe(8.75);
  });
  it.each([
    "https://attacker.example/_astro/LocalizedModels.react.fixture.js",
    "https://user@developers.openai.com/_astro/LocalizedModels.react.fixture.js",
    "https://developers.openai.com/_astro/LocalizedModels.react.fixture.js?other=x",
    "/_astro/LocalizedModels.react.fixture.js?dpl=test&dpl=again",
    "/_astro/LocalizedModels.react.fixture.js#fragment",
    "/other/LocalizedModels.react.fixture.js",
    "/_astro/LocalizedModels.react.extra.fixture.js",
    "/_astro/LocalizedModels.react.fixture%2Ejs",
    "/_astro/LocalizedModels.react.fixture/js",
  ])("refuses untrusted component reference %s", async (reference) => {
    const bodies = [...fixtureBodies];
    bodies[0] = `<astro-island component-url="${reference}"></astro-island>`;
    const fetcher = transport(bodies);
    expect((await fetchOfficialModelRates(Date.now() + 10_000)).size).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([1, 2])("refuses a foreign import at chain step %s", async (step) => {
    const bodies = [...fixtureBodies];
    bodies[step] = bodies[step].replace('"./', '"https://attacker.example/');
    const fetcher = transport(bodies);
    expect((await fetchOfficialModelRates(Date.now() + 10_000)).size).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(step + 1);
  });
  it("does no request after an expired deadline", async () => {
    const fetcher = transport();
    expect((await fetchOfficialModelRates(Date.now() - 1)).size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity])("rejects a nonfinite deadline %s", async (deadline) => {
    const fetcher = transport();
    expect((await fetchOfficialModelRates(deadline)).size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on HTTP failure", async () => {
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchOfficialModelRates(Date.now() + 10_000)).size).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refuses a response whose URL changed", async () => {
    const response = new Response(fixtureBodies[0]);
    Object.defineProperty(response, "url", { value: "https://attacker.example/" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );
    expect((await fetchOfficialModelRates(Date.now() + 10_000)).size).toBe(0);
  });
  it("refuses duplicate module references", async () => {
    const bodies = [...fixtureBodies];
    bodies[1] += bodies[1];
    const fetcher = transport(bodies);
    expect((await fetchOfficialModelRates(Date.now() + 10_000)).size).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("shares the caller deadline across dependent requests", async () => {
    const now = Date.now();
    const fetcher = transport();
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now)
      .mockReturnValue(now + 500);
    try {
      expect((await fetchOfficialModelRates(now + 100)).size).toBe(0);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });
  it("refuses and cancels a body over 2MiB", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
              },
              cancel,
            }),
          ),
      ),
    );
    expect((await fetchOfficialModelRates(Date.now() + 10_000)).size).toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
