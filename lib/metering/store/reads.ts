import { createHmac, timingSafeEqual } from "node:crypto";
import type { Operation, Receipt, ReserveInput, UsagePage, UsageQuery } from "@usagekit/core";
import type { Clock } from "@usagekit/store";
import { InvalidInput } from "@usagekit/store";
import { aggregate as groupUsage } from "@usagekit/store/reference";
import { canonical, decode } from "./codec";
import { newState } from "./command-state";
import { Prisma, type Sql } from "./sql";

type Cursor = { query: string; watermark: string; offset: number; asOf: string; expiresAt: number };
type Row = {
  operation_pk: string;
  input: unknown;
  state: Operation["state"];
  body: unknown;
  cost_units: bigint | null;
  cost_certainty: Receipt["cost"]["certainty"];
  unit: string | null;
  value: { toString(): string } | null;
  scale: number | null;
  certainty: "measured" | "estimated" | "unknown";
};
export function usageReader(clock: Clock, secret: string) {
  const sign = (body: string) => createHmac("sha256", secret).update(body).digest("base64url");
  return async (sql: Sql, q: UsageQuery): Promise<UsagePage> => {
    const { cursor, ...query } = q,
      identity = canonical(query);
    let snapshot: Cursor;
    if (cursor) {
      try {
        const parts = cursor.split(".");
        if (parts.length !== 2) throw new Error();
        const [body, signature] = parts as [string, string],
          a = Buffer.from(signature),
          b = Buffer.from(sign(body));
        if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error();
        snapshot = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Cursor;
        if (snapshot.query !== identity || snapshot.expiresAt <= clock.now().getTime())
          throw new Error();
      } catch {
        throw new InvalidInput("cursor", "unknown cursor or query mismatch");
      }
    } else {
      const [row] = await sql.query<{ n: bigint }>(
        Prisma.sql`SELECT COALESCE(MAX(event_id),0) AS n FROM metering_event`,
      );
      snapshot = {
        query: identity,
        watermark: String(row?.n ?? 0n),
        offset: 0,
        asOf: clock.now().toISOString(),
        expiresAt: clock.now().getTime() + 300000,
      };
    }
    const clauses = [
      Prisma.sql`e.namespace=${q.scope.namespace}`,
      Prisma.sql`e.occurred_at>=${new Date(q.from)}`,
      Prisma.sql`e.occurred_at<${new Date(q.to)}`,
      Prisma.sql`e.state IN ('pending','settled')`,
      Prisma.sql`e.event_id=(SELECT MAX(n.event_id) FROM metering_event n WHERE n.operation_pk=e.operation_pk AND n.event_id<=${BigInt(snapshot.watermark)})`,
    ];
    if (q.scope.kind === "principal") clauses.push(Prisma.sql`o.principal=${q.scope.principal}`);
    if (q.scope.kind === "group")
      clauses.push(Prisma.sql`o.input->'scope'->>'group'=${q.scope.group}`);
    if (q.scope.kind === "platform_pool")
      clauses.push(
        Prisma.sql`o.input->'platformPools' @> ${JSON.stringify([q.scope.poolId])}::jsonb`,
      );
    if (q.connection) clauses.push(Prisma.sql`o.input->'scope'->>'connection'=${q.connection}`);
    const records =
      await sql.query<Row>(Prisma.sql`SELECT o.operation_pk,o.input,e.state,r.body,r.cost_units,r.cost_certainty,m.unit,m.value,m.scale,m.certainty
      FROM metering_event e JOIN metering_operation o USING(operation_pk)
      JOIN metering_receipt r ON r.receipt_pk=e.receipt_pk LEFT JOIN metering_measurement m ON m.receipt_pk=r.receipt_pk
      WHERE ${Prisma.join(clauses, " AND ")} ORDER BY e.event_id,m.unit`);
    const state = newState(clock);
    for (const row of records) {
      let op = state.operations.get(row.operation_pk);
      if (!op) {
        const receipt = decode<Receipt>(row.body);
        receipt.measurements = [];
        if (row.cost_certainty !== "unknown" && row.cost_units === null)
          throw new Error("Missing stored cost");
        receipt.cost =
          row.cost_certainty === "unknown"
            ? { certainty: "unknown", money: null }
            : {
                certainty: row.cost_certainty,
                money: { currency: "USD", units: row.cost_units ?? 0n },
              };
        op = {
          ...decode<ReserveInput>(row.input),
          state: row.state,
          version: 0,
          createdAt: "",
          updatedAt: "",
          reservationExpiresAt: "",
          budgetEpochs: [],
          lease: null,
          receipts: [receipt],
        };
        state.operations.set(row.operation_pk, op);
      }
      if (row.unit !== null) {
        const receipt = op.receipts[0];
        if (!receipt) throw new Error("Missing stored receipt");
        if (row.certainty !== "unknown" && (row.value === null || row.scale === null))
          throw new Error("Missing stored quantity");
        receipt.measurements = [
          ...receipt.measurements,
          row.certainty === "unknown"
            ? { unit: row.unit, certainty: "unknown", quantity: null }
            : {
                unit: row.unit,
                certainty: row.certainty,
                quantity: {
                  unit: row.unit,
                  value: BigInt(row.value?.toString() ?? "0"),
                  scale: row.scale ?? 0,
                },
              },
        ];
      }
    }
    const all = groupUsage(state, { ...query, limit: Number.MAX_SAFE_INTEGER }).rows,
      end = snapshot.offset + (q.limit ?? 1000);
    const page: UsagePage = {
      rows: all.slice(snapshot.offset, end),
      watermark: snapshot.watermark,
      asOf: snapshot.asOf,
    };
    if (end < all.length) {
      const body = Buffer.from(JSON.stringify({ ...snapshot, offset: end })).toString("base64url");
      page.nextCursor = `${body}.${sign(body)}`;
    }
    return page;
  };
}
