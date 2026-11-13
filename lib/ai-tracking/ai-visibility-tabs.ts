/**
 * Module tabs for AI Visibility, in the final product order.
 * Overview, Prompts, Research, Sources and Engines each have a page.
 */
export const aiVisibilityTabOrder = [
  "overview",
  "prompts",
  "research",
  "sources",
  "engines",
] as const;

export type AiVisibilityTabSlot = (typeof aiVisibilityTabOrder)[number];

export const aiVisibilityTabs = [
  { id: "overview" },
  { id: "prompts" },
  { id: "research" },
  { id: "sources" },
  { id: "engines" },
] as const satisfies readonly {
  id: AiVisibilityTabSlot;
}[];

export type AiVisibilityTabId = (typeof aiVisibilityTabs)[number]["id"];

/** The earliest registered tab in the final order. Overview is that tab. */
export function defaultAiVisibilityTab(): AiVisibilityTabId {
  for (const id of aiVisibilityTabOrder) {
    const match = aiVisibilityTabs.find((tab) => tab.id === id);
    if (match) return match.id;
  }
  return aiVisibilityTabs[0].id;
}

export function resolveAiVisibilityTab(value: string | null | undefined): AiVisibilityTabId {
  const match = aiVisibilityTabs.find((tab) => tab.id === value);
  return match?.id ?? defaultAiVisibilityTab();
}

/** The tracker's prompts/runs control. It is `view` so it does not collide with the module `tab`. */
export function trackingViewFromQuery(value: string | null | undefined): "prompts" | "runs" {
  return value === "runs" ? "runs" : "prompts";
}
