import {
  researchQuoteFixture,
  researchResultFixture,
} from "@/components/ai-tracking/prompt-research-fixtures";

/** Story-only fixtures; no provider or payment requests leave the browser. */
export async function lookupPromptResearchAction(
  _projectId: string,
  input: { estimate_only?: boolean; keyword?: string },
) {
  if (input.estimate_only && input.keyword === "loading-preview")
    return new Promise<never>(() => {});
  return input.estimate_only ? researchQuoteFixture : researchResultFixture;
}

export async function trackPromptResearchAction() {
  return { added: 0, topics: [], tracked: [] };
}
