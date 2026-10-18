import "server-only";
import { after } from "next/server";
import { recordActivity } from "./capture";
import { achievementsEnabled } from "./config";
import { qualifiesPractice } from "./qualification";
export function recordQualifiedUse(input: Parameters<typeof qualifiesPractice>[0]) {
  const actorId = input.actorId;
  if (!actorId || !achievementsEnabled() || !qualifiesPractice(input)) return;
  try {
    after(() => recordActivity(actorId, "practice"));
  } catch {
    console.error("[achievements] completion capture deferred");
  }
}
export async function withAchievementUse<T>(
  actorId: string,
  operation: string,
  estimate: boolean,
  run: () => Promise<T>,
): Promise<T> {
  const result = await run();
  const success =
    result != null &&
    !(result && typeof result === "object" && "ok" in result && result.ok === false);
  recordQualifiedUse({ actorId, operation, estimate, success });
  return result;
}
