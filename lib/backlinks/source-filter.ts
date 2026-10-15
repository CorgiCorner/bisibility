import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { BacklinkRowMode, BacklinkTargetScope } from "@/lib/providers/types";

// Match JavaScript trim() when identifying absent provider evidence.
const whitespace =
  "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

export async function unknownBacklinksSnapshotId(input: {
  includeSubdomains: boolean;
  minRows?: number;
  mode: BacklinkRowMode;
  now?: Date;
  projectId: string;
  scope: BacklinkTargetScope;
  target: string;
}) {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM backlink_snapshots
    WHERE "projectId" = ${input.projectId} AND target = ${input.target}
      AND "targetScope" = ${input.scope} AND "includeSubdomains" = ${input.includeSubdomains}
      AND summary ->> '_mode' = ${input.mode}
      ${input.now ? Prisma.sql`AND "expiresAt" > ${input.now}` : Prisma.empty}
      ${input.minRows === undefined ? Prisma.empty : Prisma.sql`AND "fetchedRowCount" >= ${input.minRows}`}
      AND (
        jsonb_typeof(summary -> '_provider') IS DISTINCT FROM 'string'
        OR btrim(summary ->> '_provider', ${whitespace}) = ''
        OR summary ->> '_provider' = 'unknown'
      )
    ORDER BY "fetchedAt" DESC, id DESC LIMIT 1
  `);
  return rows[0]?.id ?? null;
}
