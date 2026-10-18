export async function shareAchievement() {
  return { kind: "saved" as const, token: "storybook-example-link-not-a-real-share" };
}
export async function saveAchievementPreferences() {
  return { kind: "saved" as const };
}
export async function touchAchievementVisit() {
  return { recorded: false, retry: false };
}
export async function loadAchievementProgress() {
  return null;
}
