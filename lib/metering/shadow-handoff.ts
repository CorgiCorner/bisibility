import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { UsageEntry } from "./mapping";
import type { ShadowHandoff, ShadowHandoffs } from "./shadow-engine";
import { key } from "./store/codec";
import { lock, Prisma, transactions } from "./store/sql";

export function createPostgresShadowHandoffs(input: {
  prisma: PrismaClient;
  namespace: string;
  schema: string;
}): ShadowHandoffs {
  const tx = transactions(input.prisma, input.schema, { statements: 0, changes: 0n, rowsRead: 0 });

  return {
    async save(entry: UsageEntry, handoff: ShadowHandoff) {
      if (handoff.operationId !== entry.id) throw new Error("Shadow handoff operation mismatch");
      const changed = await tx.write(async (sql) => {
        await lock(sql, `metering:operation:${key(input.namespace, entry.id)}`);
        return sql.execute(Prisma.sql`INSERT INTO metering_shadow (
          namespace,operation_id,project_id,connection_id,legacy,meter,settled,
          handoff_lease_id,handoff_kind,handoff_expires_at
        )
        SELECT ${input.namespace},${entry.id},${entry.projectId},${entry.connectionId},
          'allowed','reserved','pending',${handoff.leaseId},${handoff.kind},${new Date(handoff.expiresAt)}
        FROM metering_operation operation
        WHERE operation.namespace=${input.namespace} AND operation.operation_id=${entry.id}
          AND operation.principal=${entry.ownerId} AND operation.lease_id=${handoff.leaseId}
          AND operation.state IN ('dispatch_intended','pending')
        ON CONFLICT(namespace,operation_id) DO UPDATE SET
          handoff_lease_id=EXCLUDED.handoff_lease_id,
          handoff_kind=EXCLUDED.handoff_kind,
          handoff_expires_at=EXCLUDED.handoff_expires_at,
          updated_at=now()
        WHERE metering_shadow.project_id=EXCLUDED.project_id
          AND metering_shadow.connection_id=EXCLUDED.connection_id`);
      });
      if (changed !== 1) throw new Error("Shadow handoff was fenced out");
    },
    async load(entry: UsageEntry) {
      const [row] = await tx.read((sql) =>
        sql.query<{ leaseId: string | null; kind: string | null; expiresAt: Date | null }>(
          Prisma.sql`SELECT handoff_lease_id AS "leaseId",handoff_kind AS kind,
            handoff_expires_at AS "expiresAt"
          FROM metering_shadow
          WHERE namespace=${input.namespace} AND operation_id=${entry.id}
            AND project_id=${entry.projectId} AND connection_id=${entry.connectionId}`,
        ),
      );
      if (!row?.leaseId || !row.expiresAt || (row.kind !== "lease" && row.kind !== "recovery"))
        return undefined;
      return {
        operationId: entry.id,
        leaseId: row.leaseId,
        kind: row.kind,
        expiresAt: row.expiresAt.toISOString(),
      };
    },
    async clear(entry: UsageEntry, leaseId: string) {
      await tx.write(async (sql) => {
        await lock(sql, `metering:operation:${key(input.namespace, entry.id)}`);
        await sql.execute(Prisma.sql`UPDATE metering_shadow
          SET handoff_lease_id=NULL,handoff_kind=NULL,handoff_expires_at=NULL,updated_at=now()
          WHERE namespace=${input.namespace} AND operation_id=${entry.id}
            AND project_id=${entry.projectId} AND connection_id=${entry.connectionId}
            AND handoff_lease_id=${leaseId}`);
      });
    },
  };
}
