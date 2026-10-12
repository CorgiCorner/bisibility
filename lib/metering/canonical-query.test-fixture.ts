import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  clearCanonicalUsage,
  correctCanonicalUsage,
  seedCanonicalUsage,
} from "./canonical-postgres.test-fixture";
import type { LegacyUsageSource } from "./history-types";
import { readCanonicalUsage } from "./usage-read";

/** Test-only queries over the retained Store ledger, including unsent reservations. */
export function canonicalFixture(db: PrismaClient) {
  const rows = async (args: { where?: Record<string, unknown>; orderBy?: unknown } = {}) => {
    const values = await readCanonicalUsage(Prisma.sql`TRUE`, db, true);
    const projected = values.map((row) => ({
      ...row,
      id: row.id.replace(/^(legacy:|hosted-attempt:)/, ""),
    }));
    const filtered = projected.filter((row) => matches(row, args.where ?? {}));
    if (args.orderBy) filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return filtered;
  };
  return {
    findMany: rows,
    count: async (args: Parameters<typeof rows>[0] = {}) => (await rows(args)).length,
    findFirst: async (args: Parameters<typeof rows>[0] = {}) => (await rows(args))[0] ?? null,
    findUnique: async (args: Parameters<typeof rows>[0]) => (await rows(args))[0] ?? null,
    findUniqueOrThrow: async (args: Parameters<typeof rows>[0]) => {
      const row = (await rows(args))[0];
      if (!row) throw new Error("Missing canonical fixture receipt");
      return row;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const normalized = normalize({
        createdAt: new Date(),
        source: "app",
        trigger: "manual",
        correlationId: null,
        providerRequestId: null,
        tag: null,
        keywordId: null,
        unitCostCents: null,
        usageQuantity: null,
        costCents: "0",
        ...data,
      });
      const project = normalized.projectId
        ? await db.project.findUnique({
            where: { id: normalized.projectId },
            select: { ownerId: true },
          })
        : null;
      const { id } = await seedCanonicalUsage(db, normalized, {
        ...(project ? { principal: project.ownerId } : {}),
        ...(normalized.credentialSource === "hosted" && normalized.priceCents != null
          ? {
              debitId: `fixture-debit:${normalized.id ?? crypto.randomUUID()}`,
              customerCents: String(normalized.priceCents),
            }
          : {}),
      });
      return { ...normalized, id };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      await correctCanonicalUsage(db, where.id, normalize(data));
      return (await rows({ where }))[0];
    },
    deleteMany: async (args: Parameters<typeof rows>[0] = {}) => {
      const found = await rows(args);
      await clearCanonicalUsage(
        db,
        found.map((row) => row.id),
      );
      return { count: found.length };
    },
  };
}
function normalize(data: Record<string, unknown>): Partial<LegacyUsageSource> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] =
      value instanceof Date
        ? value.toISOString()
        : value instanceof Prisma.Decimal
          ? value.toString()
          : typeof value === "number" &&
              ["costCents", "priceCents", "unitCostCents", "usageQuantity"].includes(key)
            ? String(value)
            : value;
  }
  return result as Partial<LegacyUsageSource>;
}
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND")
      return (Array.isArray(value) ? value : [value]).every((v) => matches(row, v));
    if (key === "OR") return (value as Record<string, unknown>[]).some((v) => matches(row, v));
    const actual = row[key];
    if (
      value &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !(value instanceof Prisma.Decimal)
    ) {
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === "in") return (expected as unknown[]).includes(actual);
        if (operator === "not") return actual !== expected;
        if (operator === "gte") return Number(actual) >= Number(expected);
        if (operator === "gt") return Number(actual) > Number(expected);
        if (operator === "lt") return Number(actual) < Number(expected);
        return false;
      });
    }
    return actual === value;
  });
}
