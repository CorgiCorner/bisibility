/**
 * Column boxes for the AI Visibility tables. Each table has one flexible column so its
 * header rule and row separators span the card. Fixed columns keep a content width.
 */
export type AiVisibilityColumnBox = {
  flex?: number;
  lockResize?: boolean;
  minSize?: number;
  size: number;
};

export const aiVisibilityTableLayouts = {
  brands: {
    action: { lockResize: true, minSize: 220, size: 220 },
    answers: { size: 128 },
    brand: { flex: 1, minSize: 180, size: 180 },
    links: { size: 80 },
    rank: { size: 72 },
    share: { size: 168 },
  },
  engineChoices: {
    answeredBy: { size: 280 },
    engine: { flex: 1, minSize: 200, size: 220 },
    price: { size: 160 },
    state: { lockResize: true, minSize: 160, size: 160 },
  },
  engines: {
    cited: { size: 120 },
    engine: { size: 160 },
    named: { size: 120 },
    provider: { flex: 1, minSize: 160, size: 160 },
  },
  prompts: {
    cited: { size: 110 },
    engines: { size: 220 },
    lastRun: { size: 140 },
    leader: { size: 140 },
    named: { size: 110 },
    prompt: { flex: 1, minSize: 220, size: 360 },
    type: { size: 130 },
  },
  sources: {
    action: { lockResize: true, minSize: 240, size: 240 },
    answers: { size: 110 },
    domain: { flex: 1, minSize: 180, size: 320 },
    links: { size: 140 },
    type: { size: 140 },
  },
} as const satisfies Record<string, Record<string, AiVisibilityColumnBox>>;

export type AiVisibilityTableLayoutName = keyof typeof aiVisibilityTableLayouts;

/** The single column that grows to the card edge. Two flexible columns is a layout bug. */
export function flexibleAiVisibilityColumn(table: AiVisibilityTableLayoutName): string {
  const flexible = Object.entries(aiVisibilityTableLayouts[table]).filter(
    (entry) => "flex" in entry[1] && entry[1].flex,
  );
  const column = flexible[0];
  if (flexible.length !== 1 || !column) throw new Error(`${table} must have one flexible column`);
  return column[0];
}
