import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { decodeAffectedCursor } from "./checks";
import { affectedPageSize } from "./read";
import type { AffectedCheckPage } from "./types";

export async function readNotSentChecks(
  projectId: string,
  connectionId: string,
  cursor: string | null,
  now = new Date(),
): Promise<AffectedCheckPage> {
  const after = decodeAffectedCursor(cursor, connectionId);
  const source = Prisma.sql`FROM rank_checks rc JOIN keywords k ON k.id=rc."keywordId"
    JOIN provider_blocked_attempts b ON b."rankCheckId"=rc.id
    JOIN provider_account_incidents i ON i.id=b."incidentId"
    JOIN provider_connections c ON c.id=b."connectionId"
    WHERE c."projectId"=${projectId} AND k."projectId"=${projectId}
      AND b."connectionId"=${connectionId} AND b.reason='account_blocked' AND b."createdAt" <= ${now}`;
  const [counts, rows] = await prisma.$transaction(
    [
      prisma.$queryRaw<{ total: bigint }[]>`SELECT count(DISTINCT rc.id) AS total ${source}`,
      prisma.$queryRaw<{ id: string; keyword: string; checkedAt: Date; outcome: string }[]>`
      SELECT rc."publicId" AS id,k.text AS keyword,rc."checkedAt",rc.status AS outcome ${source}
      ${after ? Prisma.sql`AND (rc."checkedAt",rc."publicId")<(${new Date(after.at)},${after.id})` : Prisma.empty}
      GROUP BY rc.id,k.text ORDER BY rc."checkedAt" DESC,rc."publicId" DESC LIMIT ${affectedPageSize + 1}`,
    ],
    { isolationLevel: "RepeatableRead" },
  );
  const page = rows.slice(0, affectedPageSize);
  const last = page.at(-1);
  return {
    rows: page.map((row) => ({
      ...row,
      checkedAt: row.checkedAt.toISOString(),
      accounting: "not_sent" as const,
    })),
    total: Number(counts[0]?.total ?? 0),
    nextCursor:
      rows.length > affectedPageSize && last
        ? Buffer.from(
            JSON.stringify({
              connection: connectionId,
              at: last.checkedAt.toISOString(),
              id: last.id,
            }),
          ).toString("base64url")
        : null,
  };
}
