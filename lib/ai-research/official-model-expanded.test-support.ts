import { fixtureDescriptor, fixturePricing } from "./official-model-rates.test-support";

// Fictional rate/limit fixtures using IDs observed in the free catalog. Not an account capture.
type Group = { name: string; snapshots: string[]; reasoning: boolean; legacy?: boolean };
const pairs: [string, string, boolean][] = [
  ["o4-mini", "2025-04-16", true],
  ["o3-mini", "2025-01-31", true],
  ["o1", "2024-12-17", true],
  ["gpt-5.5", "2026-04-23", true],
  ["gpt-5.4-nano", "2026-03-17", true],
  ["gpt-5.4-mini", "2026-03-17", true],
  ["gpt-5.4", "2026-03-05", true],
  ["gpt-5.2", "2025-12-11", true],
  ["gpt-5.1", "2025-11-13", true],
  ["gpt-5-nano", "2025-08-07", true],
  ["gpt-5-mini", "2025-08-07", true],
  ["gpt-5", "2025-08-07", true],
  ["gpt-4o-mini", "2024-07-18", false],
  ["gpt-4.1-nano", "2025-04-14", false],
  ["gpt-4.1-mini", "2025-04-14", false],
  ["gpt-4.1", "2025-04-14", false],
  ["gpt-4-turbo", "2024-04-09", false],
  ["gpt-4", "0613", false],
  ["gpt-3.5-turbo", "0125", false],
];
const groups: Group[] = [
  ...pairs.map(([name, date, reasoning]) => ({
    name,
    snapshots: [`${name}-${date}`],
    reasoning,
    legacy: ["gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"].includes(name),
  })),
  ...["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"].map((name) => ({
    name,
    snapshots: [name],
    reasoning: true,
  })),
  {
    name: "gpt-4o",
    snapshots: ["gpt-4o-2024-08-06", "gpt-4o-2024-05-13", "gpt-4o-2024-11-20"],
    reasoning: false,
  },
];
export const expandedSelection = [
  ...new Set(groups.flatMap((group) => [group.name, ...group.snapshots])),
];
function literal(value: unknown): string {
  if (typeof value === "string") return `\`${value}\``;
  if (typeof value === "boolean") return value ? "!0" : "!1";
  if (Array.isArray(value)) return `[${value.map(literal).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .map(([key, entry]) => `${key}:${literal(entry)}`)
      .join(",")}}`;
  return String(value);
}
export function expandedFixture() {
  const current: unknown[] = [];
  const legacy: unknown[] = [];
  const descriptors: string[] = [
    fixtureDescriptor.slice(0, fixtureDescriptor.indexOf("const alias=")),
  ];
  for (const [index, group] of groups.entries()) {
    const slug = (name: string) =>
      group.name === "gpt-3.5-turbo" ? name.replaceAll(".", "-") : name;
    const values = { main: { input: index + 1, cached_input: 0.25, output: index + 3 } };
    const snapshots = group.snapshots.map((name, position) => ({
      name,
      values: position ? { main: { input: 87 + position, output: 98 + position } } : values,
    }));
    const item = { name: group.name, current_snapshot: group.snapshots[0], values, snapshots };
    (group.legacy ? legacy : current).push(item);
    descriptors.push(
      `const alias=${literal({ name: group.name, slug: slug(group.name), current_snapshot: group.snapshots[0], type: group.reasoning ? "reasoning" : "chat", snapshots: group.snapshots, pricing_notes: group.name === "gpt-5.6-sol" ? ["Source tier caveat >272K input; cache writes; promo $4"] : [] })};`,
    );
    for (const name of group.snapshots)
      descriptors.push(
        `const cap=${literal({ name, slug: slug(name), context_window: 900000, max_output_tokens: 80000, reasoning_tokens: group.reasoning })};`,
      );
  }
  const section = (items: unknown[]) => ({
    price_type: "Text tokens",
    show_price_unit: true,
    columns: [{ name: "input" }, { name: "cached_input" }, { name: "output" }],
    items,
  });
  return {
    descriptor: descriptors.join("\n"),
    pricing:
      fixturePricing({ name: "Latest models", subsections: [section(current)] }) +
      `;const source={other:${literal({ name: "Other models", subsections: [section(legacy)] })}};`,
  };
}
