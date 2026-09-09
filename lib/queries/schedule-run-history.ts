import "server-only";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";
import { prisma } from "@/lib/db/prisma";
import { rankCheckRunDto, rankCheckRunSelect } from "./rank-check-run-dto";

export async function scheduleRunHistory(
  projectId: string,
  scheduleId: string,
  cursorValue?: string,
) {
  const cursor = decodeCursor(cursorValue ?? null, "rcr");
  const rows = await prisma.rankCheckRun.findMany({
    select: { ...rankCheckRunSelect, createdAt: true },
    where: {
      projectId,
      checkSchedule: { publicId: scheduleId },
      AND: [
        { OR: [{ launchedAt: { not: null } }, { status: "cancelled", finishedAt: { not: null } }] },
        ...(cursor
          ? [
              {
                OR: [
                  { createdAt: { lt: new Date(cursor.t) } },
                  { createdAt: new Date(cursor.t), publicId: { lt: cursor.public_id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    take: 51,
  });
  const last = rows[49];
  return {
    data: rows.slice(0, 50).map((row) => rankCheckRunDto(row)),
    nextCursor:
      rows.length > 50 && last
        ? encodeCursor({ publicId: last.publicId, timestamp: last.createdAt }, "rcr")
        : null,
  };
}
