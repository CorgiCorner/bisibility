import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { meteringNamespace, meteringSchema } from "./runtime";
import type { ShadowComparison } from "./shadow-engine";
import { Prisma, transactions } from "./store/sql";

export function createPostgresShadowSink(input: {
  prisma: PrismaClient;
  namespace: string;
  schema: string;
}) {
  const tx = transactions(input.prisma, input.schema, { statements: 0, changes: 0n, rowsRead: 0 });
  return {
    async writeComparison(value: ShadowComparison) {
      await tx.write((sql) =>
        sql.execute(Prisma.sql`INSERT INTO metering_shadow(namespace,operation_id,project_id,connection_id,funding_source,legacy,meter,settled,duration_ms)
          VALUES(${input.namespace},${value.operationId},${value.projectId},${value.connectionId},${value.funding},${value.legacy},${value.meter},${value.settled},${value.durationMs})
          ON CONFLICT(namespace,operation_id) DO UPDATE SET
            meter=CASE WHEN metering_shadow.meter='exceeded' THEN 'exceeded' ELSE EXCLUDED.meter END,
            settled=EXCLUDED.settled,duration_ms=metering_shadow.duration_ms+EXCLUDED.duration_ms,updated_at=now()`),
      );
    },
    async writeFailure(entry: {
      id: string;
      projectId: string;
      connectionId: string;
      funding?: "byok" | "platform";
    }) {
      await tx.write((sql) =>
        sql.execute(Prisma.sql`INSERT INTO metering_shadow(namespace,operation_id,project_id,connection_id,funding_source,legacy,meter,settled,failures)
          VALUES(${input.namespace},${entry.id},${entry.projectId},${entry.connectionId},${entry.funding ?? "byok"},'allowed','error','error',1)
          ON CONFLICT(namespace,operation_id) DO UPDATE SET failures=metering_shadow.failures+1,settled='error',updated_at=now()`),
      );
    },
  };
}

function currentSink() {
  return createPostgresShadowSink({
    prisma,
    namespace: meteringNamespace(),
    schema: meteringSchema(),
  });
}

export async function writeShadowComparison(value: ShadowComparison) {
  await currentSink().writeComparison(value);
}

export async function writeShadowFailure(entry: {
  id: string;
  projectId: string;
  connectionId: string;
  funding?: "byok" | "platform";
}) {
  await currentSink().writeFailure(entry);
}
