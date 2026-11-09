"use server";
import { captureDailyActivity } from "@/lib/achievements/capture";
import { updateAchievementPreferences } from "@/lib/achievements/preferences";
import { readAchievements } from "@/lib/achievements/read";
import { setAchievementSharing } from "@/lib/achievements/sharing";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { getOptionalAvailableSession, requireSession } from "@/lib/auth/session";
export async function touchAchievementVisit() {
  let session: Awaited<ReturnType<typeof getOptionalAvailableSession>>;
  try {
    session = await getOptionalAvailableSession();
  } catch {
    return { recorded: false, retry: true };
  }
  if (!session) return { recorded: false, retry: false };
  const result = await captureDailyActivity(session.user.id, "presence");
  return { recorded: result === "recorded", retry: result === "unavailable" };
}
export async function loadAchievementProgress() {
  const session = await requireSession();
  return readAchievements(session.user.id);
}
export async function saveAchievementPreferences(input: unknown) {
  const session = await requireSession();
  const actionResult = await updateAchievementPreferences(session.user.id, input, () =>
    recordAppAction(session),
  );
  return actionResult;
}
export async function shareAchievement(input: unknown) {
  const session = await requireSession();
  const actionResult = await setAchievementSharing(session.user.id, input, () =>
    recordAppAction(session),
  );
  return actionResult;
}
