export async function launchSerpPlaygroundAction() {
  return { ok: false as const };
}
export async function readSerpPlaygroundAction() {
  return { ok: false as const };
}
export async function previewSerpPlaygroundAction() {
  return { ok: false as const, reason: "unavailable" as const };
}
export async function getSerpPlaygroundRawAction() {
  return { ok: true as const, response: null };
}
export async function previewSerpPlaygroundSaveAction() {
  return { ok: false as const };
}
export async function saveSerpPlaygroundAction() {
  return { ok: false as const };
}
