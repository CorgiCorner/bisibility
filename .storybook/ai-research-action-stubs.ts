export async function analyzeAiResearchAction() {
  return {
    ok: false,
    reason: "storybook",
    message: "Use the story-provided mock analysis action.",
  };
}

export async function getAiResearchCatalogAction() {
  return { ok: false, reason: "no_source" };
}
