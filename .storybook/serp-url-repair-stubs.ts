export async function resolveSerpUrlsAction() {
  return { status: "running" as const, workflowId: "story-url-repair" };
}
export async function readSerpUrlRepairAction() {
  return { status: "completed" as const, result: { resolved: 3, unresolved: 0 } };
}
