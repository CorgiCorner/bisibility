/** History is supplied by explicit story fixtures, never by server actions. */
export async function loadModelPlaygroundHistoryAction() {
  throw new Error("Use an explicit history fixture.");
}
export async function loadSerpPlaygroundHistoryAction() {
  throw new Error("Use an explicit history fixture.");
}
export async function loadKeywordResearchHistoryAction() {
  throw new Error("Use an explicit history fixture.");
}
export async function readStoredKeywordResearchAction() {
  throw new Error("Use an explicit history fixture.");
}

export async function readModelPlaygroundRetainedResultAction() {
  return { ok: false as const, reason: "not_found" as const };
}

export async function saveModelPlaygroundReportAction() {
  return { ok: true as const, reportId: "agr_aaaaaaaaaaaaaaaaaaaaaaaa", alreadySaved: true };
}

export async function pinResearchHistoryAction() {
  return { ok: false };
}
export async function unpinResearchHistoryAction() {
  return { ok: false };
}
