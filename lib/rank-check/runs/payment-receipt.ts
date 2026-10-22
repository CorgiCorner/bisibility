import "server-only";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { readActionPaymentConsent } from "@/lib/action-payment/durable-consent";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { readCanonicalUsage, type UsageReadClient } from "@/lib/metering/usage-read";
import { retainedRankPaymentSchema } from "./payment-contract";

type Run = {
  id: string;
  publicId: string;
  projectId: string;
  selectionSpec: unknown;
  status: string;
};
function accepted(run: Run) {
  const sealed = (run.selectionSpec as Record<string, unknown> | null)?.rankPaymentConsent;
  if (!sealed) return undefined;
  const consent = readActionPaymentConsent(sealed, retainedRankPaymentSchema);
  if (consent.runPublicId !== run.publicId || consent.projectId !== run.projectId)
    throw new Error("Rank payment history binding changed.");
  return consent;
}
async function receipt(
  run: Run,
  item?: { checkId: string | null; publicId: string; status: string },
  db: UsageReadClient = prisma,
): Promise<ActionPaymentReceipt | undefined> {
  const consent = accepted(run);
  if (!consent) return undefined;
  // Original native definition proofs exclude separately purchased snapshot continuations.
  const rows =
    item && !item.checkId
      ? []
      : await readCanonicalUsage(
          Prisma.sql`
    "projectId"=${run.projectId} AND feature='rank_check' AND NOT "chargeReplayed" AND EXISTS (
      SELECT 1 FROM measurement_native_dispatch_proofs d
      JOIN measurement_execution_bindings b ON b.id=d."bindingId"
      JOIN rank_checks c ON c.id=b."rankCheckId"
      WHERE d.namespace=u.namespace AND d."operationId"=u.id AND b."projectId"=${run.projectId}
        AND c."runId"=${run.id} ${item ? Prisma.sql`AND c.id=${item.checkId}` : Prisma.empty})`,
          db,
        );
  const pending = item
    ? ["queued", "running", "submitting"].includes(item.status)
    : !["completed", "cancelled"].includes(run.status);
  const known =
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.provider === consent.option.providerId &&
        row.connectionId === consent.connectionId &&
        row.credentialSource === (consent.option.fundingSource === "platform" ? "hosted" : "own") &&
        row.measurementStatus === "recorded",
    );
  const amounts = rows.map((row) =>
    consent.option.fundingSource === "platform"
      ? row.priceCents
      : consent.option.payableUnit.kind === "currency"
        ? (row.costCents?.div(100) ?? null)
        : row.usageQuantity,
  );
  const measured = known && !pending && amounts.every((value) => value !== null);
  return {
    actionId: item?.publicId ?? run.publicId,
    quoteId: consent.quoteId,
    option: consent.option,
    state: measured ? "settled" : pending ? "pending" : "unknown",
    charge: {
      unit: consent.option.payableUnit,
      certainty: measured ? "measured" : "unknown",
      value: measured
        ? amounts
            .reduce<Prisma.Decimal>((sum, amount) => sum.plus(amount ?? 0), new Prisma.Decimal(0))
            .toFixed()
        : null,
    },
  };
}
export function rankRunPaymentReceipt(run: Run) {
  return receipt(run);
}
export function rankItemPaymentReceipt(
  run: Run,
  item: { checkId: string | null; publicId: string; status: string },
) {
  return receipt(run, item);
}
/** Caller already owns the report's project authorization/transaction; no current connection repricing. */
export async function rankCheckPaymentReceipt(
  projectId: string,
  checkPublicId: string,
  db: UsageReadClient = prisma,
) {
  const [row] = await db.$queryRaw<
    (Run & { checkId: string; checkPublicId: string; checkStatus: string })[]
  >`
    SELECT r.id,r."publicId",r."projectId",r."selectionSpec",r.status,c.id AS "checkId",c."publicId" AS "checkPublicId",c.status AS "checkStatus"
    FROM rank_checks c JOIN rank_check_runs r ON r.id=c."runId" WHERE r."projectId"=${projectId} AND c."publicId"=${checkPublicId}`;
  return row
    ? receipt(
        row,
        { checkId: row.checkId, publicId: row.checkPublicId, status: row.checkStatus },
        db,
      )
    : undefined;
}
