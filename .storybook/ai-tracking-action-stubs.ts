function unavailable(): never {
  throw new Error("Action unavailable in Storybook preview");
}

export async function mutateAiTrackingAction() {
  return { ok: true as const };
}
export async function getAiTrackingPage() {
  return unavailable();
}
export async function getAiTrackingScheduleList() {
  return unavailable();
}
export async function previewAiTrackingAction() {
  return unavailable();
}
export async function launchAiTrackingAction() {
  return unavailable();
}
export async function getAiTrackingSamplesAction() {
  return unavailable();
}
export async function getAiTrackingRunsAction() {
  return unavailable();
}
export async function aiTrackingRunAction() {
  return unavailable();
}
export async function getAiTrackingTrendsAction() {
  return unavailable();
}
export async function exportAiTrackingEvidenceAction() {
  return unavailable();
}
export async function suggestAiTrackingPromptsAction() {
  return unavailable();
}
