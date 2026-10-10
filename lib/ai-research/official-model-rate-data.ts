import type { AiModelRate } from "./catalog-pricing";
import {
  defaultTokenUnit,
  literalData,
  literalInteger,
  literalString,
  namedObjects,
  usdRenderer,
} from "./official-model-literals";

const DEFAULT_MODELS = [
  "gpt-4.1-mini",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1-nano",
  "gpt-4.1-nano-2025-04-14",
];
const MAX_SOURCE_LENGTH = 2 * 1024 * 1024;
const CHARGE_KEYS = ["input", "cached_input", "output"];
type RecordValue = Record<string, unknown>;
type PriceRow = { section: RecordValue; item: RecordValue; dated: RecordValue };
function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function usdOverrides(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (Array.isArray(value)) return value.every((item) => usdOverrides(item, depth + 1));
  const object = record(value);
  return (
    !object ||
    Object.entries(object).every(([key, item]) =>
      key.toLowerCase().includes("currency") ? item === "USD" : usdOverrides(item, depth + 1),
    )
  );
}
function pricingSections(source: string): RecordValue[] | null {
  const tables: RecordValue[] = [];
  for (const match of source.matchAll(/JSON\.parse\(`([^`]*)`\)/g)) {
    if (match[1].includes("${") || match[1].includes("\\")) continue;
    try {
      const table = record(JSON.parse(match[1]));
      if (table?.name === "Latest models") tables.push(table);
    } catch {
      /* Unknown syntax fails closed. */
    }
  }
  if (tables.length !== 1 || !Array.isArray(tables[0].subsections) || !usdOverrides(tables[0]))
    return null;
  const other = namedObjects(source).get("Other models");
  if (other?.length === 1) {
    try {
      const table = Object.fromEntries(
        [...other[0]].map(([key, value]) => [key, literalData(value)]),
      );
      if (Array.isArray(table.subsections) && usdOverrides(table)) tables.push(table);
    } catch {
      /* Malformed legacy literals do not remove verified current prices. */
    }
  }
  return tables.flatMap((table) =>
    Array.isArray(table.subsections)
      ? table.subsections.map(record).filter((section): section is RecordValue => !!section)
      : [],
  );
}
function standardRates(value: unknown): { input: number; output: number; cached?: number } | null {
  const main = record(record(value)?.main);
  const cached = main?.cached_input;
  return main &&
    Object.keys(main).every((key) => CHARGE_KEYS.includes(key)) &&
    positive(main.input) &&
    positive(main.output) &&
    (cached === undefined ||
      (typeof cached === "number" &&
        Number.isFinite(cached) &&
        cached >= 0 &&
        cached <= main.input))
    ? {
        input: main.input,
        output: main.output,
        ...(cached === undefined ? {} : { cached: cached as number }),
      }
    : null;
}
function unitIsStandard(value: unknown): boolean {
  if (value === undefined) return true;
  const units = record(value);
  return (
    !!units &&
    Object.keys(units).every((key) => CHARGE_KEYS.includes(key)) &&
    Object.values(units).every((unit) => unit === "1M tokens")
  );
}
function validSection(section: RecordValue): boolean {
  const columns = Array.isArray(section.columns) ? section.columns.map(record) : [];
  return (
    section.price_type === "Text tokens" &&
    section.show_price_unit === true &&
    (section.price_unit === undefined || section.price_unit === "1M tokens") &&
    columns.every(
      (column) =>
        !!column &&
        CHARGE_KEYS.includes(String(column.name)) &&
        (column.unit === undefined || column.unit === "1M tokens"),
    ) &&
    new Set(columns.map((column) => column?.name)).size === columns.length &&
    ["input", "output"].every(
      (name) => columns.filter((column) => column?.name === name).length === 1,
    )
  );
}
function priceRows(sections: RecordValue[]): Map<string, PriceRow[]> {
  const output = new Map<string, PriceRow[]>();
  for (const section of sections) {
    if (!Array.isArray(section.items)) continue;
    for (const raw of section.items) {
      const item = record(raw);
      if (!item || typeof item.name !== "string" || !Array.isArray(item.snapshots)) continue;
      for (const rawSnapshot of item.snapshots) {
        const dated = record(rawSnapshot);
        if (!dated || typeof dated.name !== "string") continue;
        const names = [dated.name];
        if (dated.name === item.current_snapshot && item.name !== dated.name) names.push(item.name);
        for (const name of names)
          output.set(name, [...(output.get(name) ?? []), { section, item, dated }]);
      }
    }
  }
  return output;
}
function strings(value: string | undefined): string[] | null {
  if (value === undefined) return [];
  try {
    const parsed = literalData(value);
    return Array.isArray(parsed) &&
      parsed.length <= 100 &&
      parsed.every((item) => typeof item === "string" && item.length <= 4000)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
export function validOfficialModelSelection(names: readonly string[]): boolean {
  return (
    Array.isArray(names) &&
    names.length <= 200 &&
    names.every((name) => typeof name === "string" && /^[a-z0-9][a-z0-9._-]{0,119}$/.test(name)) &&
    new Set(names).size === names.length
  );
}
export function parseOfficialModelRates(
  descriptorSource: string,
  pricingSource: string,
  provenance: {
    checkedAt: string;
    sourceUrl: string;
    limitsSourceUrl: string;
    currencySourceUrl?: string;
  },
  rendererSource: string,
  modelNames: readonly string[] = DEFAULT_MODELS,
): ReadonlyMap<string, AiModelRate> {
  const rates = new Map<string, AiModelRate>();
  if (
    !validOfficialModelSelection(modelNames) ||
    [descriptorSource, pricingSource, rendererSource].some(
      (source) => source.length > MAX_SOURCE_LENGTH,
    )
  )
    return rates;
  const sections = pricingSections(pricingSource);
  if (!sections || !defaultTokenUnit(descriptorSource) || !usdRenderer(rendererSource))
    return rates;
  const prices = priceRows(sections);
  const descriptors = namedObjects(descriptorSource);
  for (const name of modelNames) {
    const rows = prices.get(name);
    if (rows?.length !== 1) continue;
    const { section, item, dated } = rows[0];
    if (!validSection(section) || !unitIsStandard(item.units) || !unitIsStandard(dated.units))
      continue;
    if (
      [
        ...(descriptors.get(String(item.name)) ?? []),
        ...(descriptors.get(String(dated.name)) ?? []),
      ].some((entry) => entry.has("invalid_literal"))
    )
      continue;
    const aliases = descriptors
      .get(String(item.name))
      ?.filter((entry) => entry.has("current_snapshot"));
    const limits = descriptors
      .get(String(dated.name))
      ?.filter((entry) => entry.has("context_window") || entry.has("max_output_tokens"));
    if (aliases?.length !== 1 || limits?.length !== 1) continue;
    const alias = aliases[0];
    const limit = limits[0];
    const snapshots = strings(alias.get("snapshots"));
    const notes = strings(alias.get("pricing_notes"));
    const reasoning = limit.get("reasoning_tokens");
    if (
      !validOfficialModelSelection([literalString(alias.get("slug")) ?? ""]) ||
      !["chat", "reasoning"].includes(literalString(alias.get("type")) ?? "") ||
      literalString(alias.get("current_snapshot")) !== item.current_snapshot ||
      !snapshots ||
      new Set(snapshots).size !== snapshots.length ||
      snapshots.filter((snapshot) => snapshot === dated.name).length !== 1 ||
      !notes ||
      !validOfficialModelSelection([literalString(limit.get("slug")) ?? ""]) ||
      !["!0", "true", "!1", "false"].includes(reasoning ?? "")
    )
      continue;
    if (
      (literalString(alias.get("type")) === "reasoning") !==
      ["!0", "true"].includes(reasoning ?? "")
    )
      continue;
    const contextTokens = literalInteger(limit.get("context_window"));
    const maxOutputTokens = literalInteger(limit.get("max_output_tokens"));
    const main = standardRates(item.values);
    const snapshot = standardRates(dated.values);
    if (!contextTokens || !maxOutputTokens || maxOutputTokens > contextTokens || !main || !snapshot)
      continue;
    if (
      dated.name === item.current_snapshot &&
      (main.input !== snapshot.input ||
        main.output !== snapshot.output ||
        main.cached !== snapshot.cached)
    )
      continue;
    rates.set(name, {
      inputUsdPerMillion: snapshot.input,
      outputUsdPerMillion: snapshot.output,
      ...(snapshot.cached === undefined ? {} : { cachedInputUsdPerMillion: snapshot.cached }),
      contextTokens,
      maxOutputTokens,
      reasoning: ["!0", "true"].includes(reasoning ?? ""),
      pricingNotes: notes,
      forecastAssumptions: ["standard processing", "uncached input", "short context"],
      ...provenance,
    });
  }
  return rates;
}
