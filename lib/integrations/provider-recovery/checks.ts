import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { finalReceiptJoin } from "@/lib/provider-usage/reconcile-state";
import { z } from "zod";
import { affectedOperations, affectedPageSize } from "./read";
import type { AffectedCheckPage } from "./types";

const cursorSchema = z
  .object({ connection: z.string().min(1), at: z.iso.datetime(), id: z.string().min(1).max(120) })
  .strict();
export function decodeAffectedCursor(value: string | null, connection: string) {
  if (value === null) return null;
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw new Error("Invalid affected-check cursor.");
  const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  if (cursor.connection !== connection)
    throw new Error("The affected-check cursor belongs to another connection.");
  return cursor;
}

/** Already-authorized internal project and connection; never accepts a tenant ID from a cursor. */
export async function readAffectedChecks(
  projectId: string,
  connectionId: string,
  cursor: string | null,
  now = new Date(),
): Promise<AffectedCheckPage> {
  const after = decodeAffectedCursor(cursor, connectionId);
  const predicate = affectedOperations(projectId, connectionId, now);
  const from = Prisma.sql`FROM rank_checks rc JOIN keywords k ON k.id=rc."keywordId"
    JOIN (SELECT COALESCE(t."rankCheckId",p.context->>'rankCheckId') AS "checkId",
        r.body->'cost'->>'certainty'='measured' AS measured
      FROM metering_operation o ${finalReceiptJoin}
      LEFT JOIN metering_paid_attempt_context p ON p.namespace=o.namespace AND p.operation_id=o.operation_id
      LEFT JOIN queued_rank_check_tasks t ON t.id=COALESCE(o.input->>'correlationId',p.context->>'correlationId')
      WHERE ${predicate}) a ON a."checkId"=rc.id
    WHERE k."projectId"=${projectId}`;
  const [counts, rows] = await prisma.$transaction(
    [
      prisma.$queryRaw<{ total: bigint }[]>`SELECT count(DISTINCT rc.id) AS total ${from}`,
      prisma.$queryRaw<
        {
          id: string;
          keyword: string;
          checkedAt: Date;
          outcome: string;
          costMeasured: boolean | null;
        }[]
      >`
      SELECT rc."publicId" AS id,k.text AS keyword,rc."checkedAt",rc.status AS outcome,
        bool_and(COALESCE(a.measured,false)) AS "costMeasured" ${from}
      ${after ? Prisma.sql`AND (rc."checkedAt",rc."publicId")<(${new Date(after.at)},${after.id})` : Prisma.empty}
      GROUP BY rc.id,k.text
      ORDER BY rc."checkedAt" DESC,rc."publicId" DESC LIMIT ${affectedPageSize + 1}`,
    ],
    { isolationLevel: "RepeatableRead" },
  );
  const page = rows.slice(0, affectedPageSize);
  const last = page.at(-1);
  return {
    rows: page.map(({ costMeasured, ...row }) => ({
      ...row,
      checkedAt: row.checkedAt.toISOString(),
      accounting: costMeasured ? "measured" : "unknown",
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
