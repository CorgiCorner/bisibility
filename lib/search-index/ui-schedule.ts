import "server-only";
import { getTemporalSnapshot } from "@/lib/ops/temporal-snapshot";
import type { IndexingBackgroundRun } from "./ui-model";

/** Request paths use the worker's fresh read model and never connect to Temporal. */
export async function indexingBackgroundRun(
  enabled: boolean,
  now = new Date(),
): Promise<IndexingBackgroundRun> {
  if (!enabled) return { state: "disabled", nextAt: null };
  const unavailable: IndexingBackgroundRun = { state: "unavailable", nextAt: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshot = await Promise.race([
      getTemporalSnapshot(now),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 250);
      }),
    ]);
    if (snapshot?.status !== "ok" || Date.parse(snapshot.collectedAt) > now.getTime())
      return unavailable;
    const schedule = snapshot.heartbeat.indexingSchedule;
    if (!schedule) return unavailable;
    if (schedule.paused) return { state: "paused", nextAt: null };
    const next = schedule.nextActionTimes
      .map((value) => new Date(value))
      .filter((date) => date > now)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return next ? { state: "scheduled", nextAt: next.toISOString() } : unavailable;
  } catch {
    return unavailable;
  } finally {
    clearTimeout(timer);
  }
}
