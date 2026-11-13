import { Prisma } from "@/lib/generated/prisma/client";

export function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export function ilike(expression: Prisma.Sql, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return Prisma.sql`TRUE`;
  return Prisma.sql`${expression} ILIKE ${likePattern(trimmed)} ESCAPE '\\'`;
}

export function keysetSql(
  column: "createdAt" | "fetchedAt",
  cursor: { at: string; id: string } | null,
) {
  if (!cursor) return Prisma.sql`TRUE`;
  const at = new Date(cursor.at);
  const quoted = Prisma.raw(`"${column}"`);
  return Prisma.sql`(${quoted} < ${at} OR (${quoted} = ${at} AND id < ${cursor.id}))`;
}

export function countValue(rows: ReadonlyArray<{ count?: unknown }>) {
  const count = Number(rows[0]?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

export function textValues(rows: ReadonlyArray<{ value?: unknown }>) {
  return rows.flatMap((row) => (typeof row.value === "string" && row.value ? [row.value] : []));
}
