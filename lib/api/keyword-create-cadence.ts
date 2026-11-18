import type { StoredSchedule } from "@/lib/actions/_schedule";
import type { Prisma } from "@/lib/generated/prisma/client";
import { setKeywordCadence } from "@/lib/rank-check/schedules/keyword-cadence";
import type { KeywordCreateReview } from "@/lib/schedules/keyword-create-write";

type AcceptedKeyword = {
  created: boolean;
  restored?: boolean;
  keyword: { id: string };
  row: { schedule?: StoredSchedule | null; scheduleSource?: "frequency" | "schedule" };
};

/** One locked membership mutation per explicitly selected cadence, never per keyword or duplicate. */
export async function assignCreatedKeywordCadences(
  tx: Prisma.TransactionClient,
  projectId: string,
  accepted: readonly AcceptedKeyword[],
  actorId: string | null,
  admission?: KeywordCreateReview,
) {
  const groups = new Map<
    string,
    { cadence: StoredSchedule; source: "frequency" | "schedule"; ids: string[] }
  >();
  for (const { created, restored, keyword, row } of accepted) {
    if ((!created && !restored) || !row.schedule) continue;
    const { nextCheckAt: _next, ...definition } = row.schedule;
    const source = row.scheduleSource ?? "schedule";
    const key = JSON.stringify([definition, source]);
    const group = groups.get(key) ?? { cadence: row.schedule, source, ids: [] };
    group.ids.push(keyword.id);
    groups.set(key, group);
  }
  for (const { cadence, ids, source } of groups.values()) {
    if (admission) await setKeywordCadence(tx, projectId, ids, cadence, actorId, source, admission);
    else await setKeywordCadence(tx, projectId, ids, cadence, actorId, source);
  }
}
