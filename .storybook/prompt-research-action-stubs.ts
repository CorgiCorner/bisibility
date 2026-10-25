export async function lookupPromptResearchAction() {
  return { ok: false, reason: "storybook", message: "Use a cached research story." };
}

export async function trackPromptResearchAction() {
  return { added: 0, topics: [], tracked: [] };
}
