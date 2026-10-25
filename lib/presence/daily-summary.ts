import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { currentPageIndexingScope } from "@/lib/search-index/current-rows";
import { pageIndexingGroup } from "@/lib/search-index/report";
import { projectDay } from "./project-day";

function coverage(state: Prisma.JsonValue) {
  return state &&
    typeof state === "object" &&
    !Array.isArray(state) &&
    typeof state.coverageState === "string"
    ? state.coverageState
    : "Unspecified";
}

export async function persistIndexingDay(input: {
  projectId: string;
  property: string | null;
  now: Date;
  stop: "quota" | "off" | null;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`indexing-summary:${input.projectId}`}))`;
    const defaults = await tx.projectDefaults.findUnique({ where: { projectId: input.projectId } });
    const day = projectDay(input.now, defaults?.timezone ?? "UTC");
    const where = { projectId_date: { projectId: input.projectId, date: day.date } };
    const previous = await tx.pageIndexingDay.findUnique({ where });
    if (previous && previous.recordedAt > input.now) return;
    const scope = input.property
      ? (await currentPageIndexingScope(input.projectId, input.property, false, tx)).where
      : { projectId: input.projectId, url: { in: [] as string[] } };
    const rows = await tx.urlPresence.findMany({ where: scope });
    const changeWhere = {
      ...scope,
      at: { gte: day.gte, lt: day.lt },
      previous: { not: Prisma.JsonNull },
    };
    const [count, changes] = await Promise.all([
      tx.urlPresenceChange.count({ where: changeWhere }),
      tx.urlPresenceChange.findMany({
        where: changeWhere,
        orderBy: [{ at: "desc" }, { id: "desc" }],
        take: 5,
        select: { url: true, previous: true, next: true },
      }),
    ]);
    const inDay = (at: Date | null) => at !== null && at >= day.gte && at < day.lt;
    const groups = rows.map(pageIndexingGroup);
    const data = {
      property: input.property,
      indexed: groups.filter((group) => group === "indexed").length,
      notIndexed: groups.filter((group) => group === "not_indexed").length,
      failed: groups.filter((group) => group === "inspection_failed").length,
      checked: groups.filter((group) => group !== "not_checked").length,
      total: rows.length,
      inspectedThatDay: rows.filter((row) => inDay(row.checkedAt) || inDay(row.inspectionFailedAt))
        .length,
      stop: input.stop,
      changes: {
        count,
        entries: changes.map((row) => ({
          url: row.url,
          previous: coverage(row.previous),
          next: coverage(row.next),
        })),
      },
      recordedAt: input.now,
    };
    await tx.pageIndexingDay.upsert({
      where,
      create: { projectId: input.projectId, date: day.date, ...data },
      update: data,
    });
  });
}
