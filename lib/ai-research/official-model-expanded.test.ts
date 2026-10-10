import { afterEach, describe, expect, it, vi } from "vitest";
import { expandedFixture, expandedSelection } from "./official-model-expanded.test-support";
import { literalData } from "./official-model-literals";
import { parseOfficialModelRates } from "./official-model-rate-data";
import { fetchOfficialModelRates } from "./official-model-rates";
import {
  fixtureBodies,
  fixtureOrigin,
  fixturePaths,
  fixtureRenderer,
} from "./official-model-rates.test-support";

const provenance = {
  checkedAt: "2026-10-06T10:00:00.000Z",
  sourceUrl: `${fixtureOrigin}${fixturePaths[3]}`,
  limitsSourceUrl: `${fixtureOrigin}${fixturePaths[2]}`,
  currencySourceUrl: `${fixtureOrigin}${fixturePaths[1]}`,
};
function parse(descriptor: string, pricing: string, names = expandedSelection) {
  return parseOfficialModelRates(descriptor, pricing, provenance, fixtureRenderer, names);
}
afterEach(() => vi.unstubAllGlobals());
describe("current provider selection and unit forecasts", () => {
  it("discovers all45 selected IDs with reasoning facts and separately matched self snapshots", () => {
    const fixture = expandedFixture();
    const rates = parse(fixture.descriptor, fixture.pricing);
    expect(expandedSelection).toHaveLength(45);
    expect([...rates.keys()]).toEqual(expandedSelection);
    expect([...rates.values()].filter((rate) => rate.reasoning)).toHaveLength(27);
    expect(rates.get("gpt-5.6-sol")).toMatchObject({
      reasoning: true,
      contextTokens: 900000,
      maxOutputTokens: 80000,
      cachedInputUsdPerMillion: 0.25,
      forecastAssumptions: ["standard processing", "uncached input", "short context"],
      pricingNotes: ["Source tier caveat >272K input; cache writes; promo $4"],
    });
    for (const rate of rates.values()) expect(rate).not.toHaveProperty("webSearchMaxCostCents");
  });
  it("uses the requested older snapshot price instead of the current alias price", () => {
    const fixture = expandedFixture();
    const rates = parse(fixture.descriptor, fixture.pricing);
    expect(rates.get("gpt-4o-2024-05-13")?.inputUsdPerMillion).toBe(88);
    expect(rates.get("gpt-4o-2024-05-13")?.inputUsdPerMillion).not.toBe(
      rates.get("gpt-4o")?.inputUsdPerMillion,
    );
    expect(rates.get("gpt-3.5-turbo")).toBeDefined();
  });
  it("loads all selections using the existing bounded four free public GETs", async () => {
    const fixture = expandedFixture();
    const bodies = [...fixtureBodies];
    bodies[2] = fixture.descriptor;
    bodies[3] = fixture.pricing;
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(bodies[fixturePaths.findIndex((path) => url === `${fixtureOrigin}${path}`)]),
    );
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchOfficialModelRates(Date.now() + 10_000, expandedSelection)).size).toBe(45);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it.each(
    [
      [],
      ["gpt-5", "gpt-5"],
      ["https://attacker.example/"],
      ["x".repeat(121)],
      Array.from({ length: 201 }, (_, index) => `model-${index}`),
    ].map((selection) => ({ selection })),
  )("refuses invalid or empty selection without HTTP", async ({ selection }) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchOfficialModelRates(Date.now() + 10_000, selection)).size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("leaves an unknown model unavailable rather than assigning another rate", () => {
    const fixture = expandedFixture();
    expect(parse(fixture.descriptor, fixture.pricing, ["unknown-model"]).size).toBe(0);
  });
  it("blocks duplicate roles in self-snapshot descriptors", () => {
    const fixture = expandedFixture();
    const alias = fixture.descriptor
      .split("\n")
      .find((line) => line.startsWith("const alias={name:`gpt-5.6-sol`"));
    const rates = parse(`${fixture.descriptor}\n${alias}`, fixture.pricing);
    expect(rates.has("gpt-5.6-sol")).toBe(false);
    expect(rates.has("gpt-5.6-terra")).toBe(true);
  });
  it("blocks malformed duplicate fields instead of ignoring their source", () => {
    const fixture = expandedFixture();
    const malformed = "const alias={name:`gpt-5.6-sol`,type:`reasoning`,type:`chat`};";
    expect(parse(`${fixture.descriptor}\n${malformed}`, fixture.pricing).has("gpt-5.6-sol")).toBe(
      false,
    );
  });
  it("blocks unknown legacy charge fields while retaining current verified rates", () => {
    const fixture = expandedFixture();
    const pricing = fixture.pricing.replace(
      "name:`gpt-4-turbo`,current_snapshot:",
      "name:`gpt-4-turbo`,units:{extra_fee:`1M tokens`},current_snapshot:",
    );
    const rates = parse(fixture.descriptor, pricing);
    expect(rates.has("gpt-4-turbo")).toBe(false);
    expect(rates.has("gpt-5.6-sol")).toBe(true);
  });
});
describe("restricted official literals", () => {
  it("parses only static nested values and leading-decimal prices", () => {
    expect(literalData("{input:.5,other:[!0,!1,`literal $4`,1e-3]}")).toEqual({
      input: 0.5,
      other: [true, false, "literal $4", 0.001],
    });
  });
  it.each([
    "{price:run()}",
    "{price:`" + "${" + "run()}`}",
    "{price:new Date(0)}",
    "{...source}",
    "{a:1,a:2}",
    "[1,execute()]",
    "{a:]1}",
    "[1]followup()",
    "NaN",
    "Infinity",
  ])("refuses source expressions or malformed syntax %s", (source) => {
    expect(() => literalData(source)).toThrow();
  });
});
