import { describe, expect, it } from "vitest";
import { parseOfficialModelRates as parseWithRenderer } from "./official-model-rate-data";
import {
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
function parseOfficialModelRates(descriptor: string, pricing: string, source: typeof provenance) {
  return parseWithRenderer(descriptor, pricing, source, fixtureRenderer);
}
describe("official literal schema validation", () => {
  it.each([
    ["reasoning_tokens:!1", "reasoning_tokens:!0"],
    ["context_window:900000", "context_window:0"],
    ["max_output_tokens:28000", "max_output_tokens:900001"],
    ["max_output_tokens:28000", "max_output_tokens:compute()"],
    ["current_snapshot:`gpt-4.1-mini-2025-04-14`", "current_snapshot:`gpt-4.1-mini-2026-01-01`"],
    ["snapshots:[`gpt-4.1-mini-2025-04-14`]", "snapshots:[]"],
  ])("blocks affected models for %s -> %s", (before, after) => {
    const rates = parseOfficialModelRates(
      fixtureDescriptor.replace(before, after),
      fixturePricing(),
      provenance,
    );
    expect(rates.has("gpt-4.1-mini")).toBe(false);
    expect(rates.has("gpt-4.1-nano")).toBe(true);
  });
  it("rejects duplicated descriptor objects", () => {
    const duplicate = fixtureDescriptor.match(/const alias=\{[^\n]+/g)?.[0] ?? "";
    const rates = parseOfficialModelRates(
      `${fixtureDescriptor}\n${duplicate}`,
      fixturePricing(),
      provenance,
    );
    expect(rates.has("gpt-4.1-mini")).toBe(false);
    expect(rates.has("gpt-4.1-nano")).toBe(true);
  });
  it("requires the source's verified default million-token unit", () => {
    expect(
      parseOfficialModelRates(
        fixtureDescriptor.replace("1M tokens", "1K tokens"),
        fixturePricing(),
        provenance,
      ).size,
    ).toBe(0);
  });
  it.each(["othern", "n$", "wrapper.n"])(
    "rejects a token-unit reference to a different identifier: %s",
    (identifier) => {
      expect(
        parseOfficialModelRates(
          fixtureDescriptor.replace("re=n??", `re=${identifier}??`),
          fixturePricing(),
          provenance,
        ).size,
      ).toBe(0);
    },
  );
  it("compares literal descriptor names without regex metacharacters", () => {
    const rates = parseOfficialModelRates(
      fixtureDescriptor.replace("name:`gpt-4.1-mini`", "name:`gpt-4x1-mini`"),
      fixturePricing(),
      provenance,
    );
    expect(rates.has("gpt-4.1-mini")).toBe(false);
    expect(rates.has("gpt-4.1-nano")).toBe(true);
  });
  it("supports exact dollar-prefixed identifiers for units and currency formatting", () => {
    const descriptor = fixtureDescriptor
      .replace("price_unit:n", "price_unit:$n")
      .replace("re=n??", "re=$n??");
    const renderer = fixtureRenderer
      .replaceAll("fmt", "$fmt")
      .replace("price:p", "price:$p")
      .replace(".format(p)", ".format($p)");
    expect(parseWithRenderer(descriptor, fixturePricing(), provenance, renderer).size).toBe(4);
  });
  it.each(["descriptor", "prices", "renderer"])("rejects oversized %s parser input", (kind) => {
    const oversized = " ".repeat(2 * 1024 * 1024 + 1);
    expect(
      parseWithRenderer(
        kind === "descriptor" ? oversized : fixtureDescriptor,
        kind === "prices" ? oversized : fixturePricing(),
        provenance,
        kind === "renderer" ? oversized : fixtureRenderer,
      ).size,
    ).toBe(0);
  });
  it.each([
    fixtureRenderer.replaceAll("`USD`", "`EUR`"),
    fixtureRenderer.replace("currency:`USD`", "currency:resolveCurrency()"),
    fixtureRenderer.replace("fmt.format(p)", "fmt.format(other)"),
    fixtureRenderer.replace("fmt.format(p)", "otherfmt.format(p)"),
    fixtureRenderer.replace("fmt.format(p)", "wrapper.fmt.format(p)"),
    fixtureRenderer.replaceAll("style:`currency`", "style:`decimal`"),
    "",
  ])("requires the model renderer's explicit USD contract", (renderer) => {
    expect(parseWithRenderer(fixtureDescriptor, fixturePricing(), provenance, renderer).size).toBe(
      0,
    );
  });
  it.each(["EUR", "unknown", { code: "USD" }])(
    "refuses structured currency drift %j",
    (currency) => {
      const table = fixtureTable();
      Object.assign(table, { currency });
      expect(
        parseOfficialModelRates(fixtureDescriptor, fixturePricing(table), provenance).size,
      ).toBe(0);
    },
  );
  it("persists the exact module proving the currency", () => {
    expect(
      parseOfficialModelRates(fixtureDescriptor, fixturePricing(), provenance).get("gpt-4.1-mini"),
    ).toMatchObject({ currencySourceUrl: provenance.currencySourceUrl });
  });
  it.each(["unknown-charge", "cached-excess", "cached-negative", "cached-null"])(
    "refuses unsupported main charges: %s",
    (kind) => {
      const table = fixtureTable();
      const main = table.subsections[0].items[0].values.main;
      if (kind === "unknown-charge") Object.assign(main, { extra_fee: 9 });
      else
        Object.assign(main, {
          cached_input: kind === "cached-excess" ? 1 : kind === "cached-negative" ? -1 : null,
        });
      const rates = parseOfficialModelRates(fixtureDescriptor, fixturePricing(table), provenance);
      expect(rates.has("gpt-4.1-mini")).toBe(false);
      expect(rates.has("gpt-4.1-nano")).toBe(true);
    },
  );
  it("refuses unknown charge columns", () => {
    const table = fixtureTable();
    table.subsections[0].columns.push({ name: "extra_fee" });
    expect(parseOfficialModelRates(fixtureDescriptor, fixturePricing(table), provenance).size).toBe(
      0,
    );
  });
  it.each(["unit", "duplicate", "snapshot", "negative", "missing", "mismatch"])(
    "rejects invalid price schema: %s",
    (kind) => {
      const table = fixtureTable();
      const section = table.subsections[0];
      const item = section.items[0];
      if (kind === "unit") Object.assign(item, { units: { input: "1K tokens" } });
      if (kind === "duplicate") section.items.push(item);
      if (kind === "snapshot") item.snapshots.push(item.snapshots[0]);
      if (kind === "negative") item.values.main.output = -1;
      if (kind === "missing") Object.assign(item, { values: { batch: { input: 1, output: 2 } } });
      if (kind === "mismatch")
        item.snapshots = [
          { ...item.snapshots[0], values: { ...item.values, main: { input: 9, output: 9 } } },
        ];
      const rates = parseOfficialModelRates(fixtureDescriptor, fixturePricing(table), provenance);
      expect(rates.has("gpt-4.1-mini")).toBe(false);
      expect(rates.has("gpt-4.1-nano")).toBe(true);
    },
  );
  it.each([
    "JSON.parse(`{invalid}`)",
    'JSON.parse(`{"name":"' + "${" + 'execute()}"}`)',
    "globalThis.executed=true",
  ])("does not execute or accept source expressions", (pricing) => {
    expect(parseOfficialModelRates(fixtureDescriptor, pricing, provenance).size).toBe(0);
    expect(globalThis).not.toHaveProperty("executed");
  });
});
