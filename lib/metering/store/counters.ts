import type { RequestState } from "@usagekit/core";
import type { Clock, Store } from "@usagekit/store";
import {
  bucketOf,
  countIdentity,
  validateCountRequest,
  validateRequestCountsQuery,
} from "@usagekit/store";
import { canonical, encode, hash, key } from "./codec";
import { lock, Prisma, type transactions } from "./sql";

export function requestCounters(
  tx: ReturnType<typeof transactions>,
  clock: Clock,
): Pick<Store, "countRequest" | "requestCounts"> {
  return {
    async countRequest(input) {
      validateCountRequest(input);
      const identity = hash(countIdentity(input));
      return tx.write(async (sql) => {
        await lock(sql, `metering:operation:${key(input.scope.namespace, input.commandId)}`);
        const [previous] = await sql.query<{ identity_hash: string }>(Prisma.sql`
          SELECT identity_hash FROM metering_request_command
          WHERE namespace=${input.scope.namespace} AND command_id=${input.commandId}`);
        if (previous)
          return previous.identity_hash === identity
            ? { outcome: "counted" as const, replayed: true }
            : { outcome: "conflict" as const, reason: "command_mismatch" as const };
        const [operation] = await sql.query<{ operation_id: string }>(Prisma.sql`
          SELECT operation_id FROM metering_operation
          WHERE namespace=${input.scope.namespace} AND operation_id=${input.commandId}`);
        if (operation) return { outcome: "conflict" as const, reason: "command_mismatch" as const };
        const bucket = bucketOf(input, clock.now());
        await sql.execute(Prisma.sql`
          INSERT INTO metering_request_count(bucket_key,namespace,day,body,count)
          VALUES(${canonical(bucket)},${bucket.namespace},${new Date(`${bucket.day}T00:00:00Z`)},${encode(bucket)}::jsonb,1)
          ON CONFLICT(bucket_key) DO UPDATE SET count=metering_request_count.count+1`);
        await sql.execute(Prisma.sql`
          INSERT INTO metering_request_command(namespace,command_id,identity_hash)
          VALUES(${input.scope.namespace},${input.commandId},${identity})`);
        return { outcome: "counted" as const, replayed: false };
      });
    },
    async requestCounts(query) {
      validateRequestCountsQuery(query);
      return tx.read(async (sql) => {
        const clauses = [
          Prisma.sql`namespace=${query.scope.namespace}`,
          Prisma.sql`day>=${new Date(query.from)}`,
          Prisma.sql`day<${new Date(query.to)}`,
        ];
        if (query.scope.kind === "principal")
          clauses.push(Prisma.sql`body->>'principal'=${query.scope.principal}`);
        if (query.scope.kind === "group")
          clauses.push(Prisma.sql`body->>'group'=${query.scope.group}`);
        if (query.scope.kind === "platform_pool")
          clauses.push(Prisma.sql`body->'pools' @> ${JSON.stringify([query.scope.poolId])}::jsonb`);
        if (query.connection) clauses.push(Prisma.sql`body->>'connection'=${query.connection}`);
        const dimensions = query.groupBy.flatMap((dimension) => [
          Prisma.sql`${dimension}::text`,
          Prisma.sql`body->>${dimension}`,
        ]);
        const dimensionsSql = dimensions.length
          ? Prisma.sql`jsonb_build_object(${Prisma.join(dimensions)})`
          : Prisma.sql`'{}'::jsonb`;
        const order = [
          ...query.groupBy.map((dimension) => Prisma.sql`dimensions->>${dimension} COLLATE "C"`),
          Prisma.sql`state COLLATE "C"`,
        ];
        const limit = query.limit ?? 1000;
        const rows = await sql.query<{
          dimensions: Record<string, string>;
          state: RequestState;
          count: string;
        }>(Prisma.sql`
          SELECT dimensions,state,count FROM (
            SELECT ${dimensionsSql} AS dimensions,body->>'state' AS state,sum(count)::text AS count
            FROM metering_request_count WHERE ${Prisma.join(clauses, " AND ")} GROUP BY 1,2
          ) grouped ORDER BY ${Prisma.join(order)} LIMIT ${limit + 1}`);
        return {
          rows: rows.slice(0, limit).map((row) => ({ ...row, count: BigInt(row.count) })),
          asOf: clock.now().toISOString(),
          truncated: rows.length > limit,
        };
      });
    },
  };
}
