export async function trackModelPlaygroundAction() {
  return {
    ok: true as const,
    promptId: "aip_aaaaaaaaaaaaaaaaaaaaaaaa",
    presetId: "story-preset",
    reused: false,
  };
}
export async function readModelPlaygroundRetainedResultAction() {
  return { ok: false as const, reason: "not_found" as const };
}
export async function saveModelPlaygroundReportAction() {
  return { ok: true as const, reportId: "agr_aaaaaaaaaaaaaaaaaaaaaaaa", alreadySaved: true };
}
export async function loadModelPlaygroundHistoryAction() {
  return {
    ok: true as const,
    page: { chips: [], groups: [], nextCursor: null, pinnedCount: 0, timeZone: "UTC", total: 0 },
  };
}
export const loadSerpPlaygroundHistoryAction = loadModelPlaygroundHistoryAction;
export const loadKeywordResearchHistoryAction = loadModelPlaygroundHistoryAction;
export async function readStoredKeywordResearchAction() {
  return { ok: false as const };
}

/** Stories use their explicit in-memory port; native server actions remain inert. */
export const previewModelPlaygroundAction = async () => ({
  kind: "unavailable" as const,
  message: "Use the story's preview fixture.",
});
export const launchModelPlaygroundAction = async () => ({
  kind: "unavailable" as const,
  message: "Use the story's launch fixture.",
});
export const getModelPlaygroundCatalogAction = async () => ({
  kind: "unavailable" as const,
  message: "Use the story's catalog fixture.",
});
export const readModelPlaygroundAction = async () => null;

export async function mutateAiTrackingAction() {
  throw new Error("Use the story's explicit tracking fixture.");
}
