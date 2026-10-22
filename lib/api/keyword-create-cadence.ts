import type { StoredSchedule } from "@/lib/actions/_schedule";
import type { Prisma } from "@/lib/generated/prisma/client";
import { setKeywordCadence } from "@/lib/rank-check/schedules/keyword-cadence";

type AcceptedKeyword = {
  created: boolean;
  restored?: boolean;
  keyword: { id: string };
  row: { schedule?: StoredSchedule | null };
};

/** One locked membership mutation per explicitly selected cadence, never per keyword or duplicate. */
export async function assignCreatedKeywordCadences(
  tx: Prisma.TransactionClient,
  projectId: string,
  accepted: readonly AcceptedKeyword[],
  actorId: string | null,
) {
  const groups = new Map<string, { cadence: StoredSchedule; ids: string[] }>();
  for (const { created, restored, keyword, row } of accepted) {
    if ((!created && !restored) || !row.schedule) continue;
    const { nextCheckAt: _next, ...definition } = row.schedule;
    const key = JSON.stringify(definition);
    const group = groups.get(key) ?? { cadence: row.schedule, ids: [] };
    group.ids.push(keyword.id);
    groups.set(key, group);
  }
  for (const { cadence, ids } of groups.values()) {
    await setKeywordCadence(tx, projectId, ids, cadence, actorId);
  }
}
