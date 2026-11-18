import { Prisma } from "@/lib/generated/prisma/client";
import type { Receipt } from "@usagekit/core";
import { moneyScale, normalizeLegacyMoney } from "@usagekit/core";

const columns =
  "(receipt_pk,operation_pk,receipt_id,supersedes,body,occurred_at,recorded_at,cost_units,cost_certainty,sequence)";

/** Adapt the checksum-pinned receipt INSERT at the active host port, retaining bound values. */
export function receiptWrite(query: Prisma.Sql): Prisma.Sql {
  const first = query.strings[0] ?? "";
  if (!first.startsWith("INSERT INTO metering_receipt")) return query;
  if (!first.includes(columns) || query.values.length !== 10 || query.strings.at(-1) !== ")")
    throw new Error("Unsupported host receipt INSERT shape");
  const body = JSON.parse(String(query.values[4])) as Receipt;
  const scale = body.cost.money ? moneyScale(body.cost.money) : 4;
  const values = [...query.values];
  values[4] = JSON.stringify(normalizeLegacyMoney(body));
  const strings = [...query.strings];
  strings[0] = first.replace(columns, columns.replace("sequence)", "sequence,cost_scale)"));
  strings[strings.length - 1] = ",";
  strings.push(")");
  return Prisma.sql(strings, ...values, scale);
}
