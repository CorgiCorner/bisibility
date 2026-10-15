// Browser stories inject fixture actions; this boundary never reaches a provider.
export async function loadProviderComparisonAction() {
  return { ok: false as const };
}
export async function previewProviderComparisonAction() {
  return { ok: false as const };
}
export async function launchProviderComparisonAction() {
  return { ok: false as const, reason: "unconfirmed" as const };
}
export async function readProviderComparisonAction() {
  return { ok: false as const };
}
