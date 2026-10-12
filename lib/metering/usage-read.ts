import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { canonicalUsageSql } from "./usage-sql";
import { monthUtcRange } from "./utc-window";

export type UsageReadClient = Pick<Prisma.TransactionClient, "$queryRaw">;
export type CanonicalUsage = {
  id: string;
  namespace: string;
  principal: string;
  projectId: string;
  connectionId: string;
  providerCredentialVersion: string | null;
  correlationId: string | null;
  tag: string | null;
  keywordId: string | null;
  provider: string;
  feature: string;
  source: string;
  surface: string;
  trigger: string | null;
  credentialKind: string | null;
  credentialId: string | null;
  credentialSource: "own" | "hosted";
  createdAt: Date;
  cached: boolean;
  failed: boolean;
  measurementStatus: string;
  costCents: Prisma.Decimal | null;
  usageQuantity: Prisma.Decimal | null;
  unitCostCents: Prisma.Decimal | null;
  priceCents: Prisma.Decimal | null;
  budgetCents: Prisma.Decimal | null;
  providerRequestId: string | null;
  receiptId: string | null;
  debitId: string | null;
};
export async function readCanonicalUsage(
  where: Prisma.Sql,
  client: UsageReadClient = prisma,
  includeUnsent = false,
) {
  return client.$queryRaw<CanonicalUsage[]>(
    Prisma.sql`SELECT * FROM (${canonicalUsageSql(undefined, includeUnsent)}) u WHERE ${where}`,
  );
}
export async function monthlySpendCents(
  projectId: string,
  now = new Date(),
  client: UsageReadClient = prisma,
) {
  const range = monthUtcRange(now);
  const [row] = await client.$queryRaw<{ total: unknown }[]>(Prisma.sql`
    SELECT COALESCE(SUM("budgetCents"),0) AS total FROM (${canonicalUsageSql()}) u
    WHERE "projectId"=${projectId} AND "createdAt">=${range.gte} AND "createdAt"<${range.lt} AND NOT cached`);
  return Number(row?.total ?? 0);
}

/** Resolves an existing native identity exclusively inside the retained Store scope. */
export async function canonicalReceipt(
  client: UsageReadClient,
  projectId: string,
  id: string,
  connectionId?: string,
) {
  const rows = await readCanonicalUsage(
    Prisma.sql`"projectId"=${projectId}
    AND id IN (${id},${`legacy:${id}`},${`hosted-attempt:${id}`})
    ${connectionId ? Prisma.sql`AND "connectionId"=${connectionId}` : Prisma.empty}`,
    client,
    true,
  );
  if (rows.length > 1) throw new Error("Ambiguous canonical operation identity");
  return rows[0] ?? null;
}
