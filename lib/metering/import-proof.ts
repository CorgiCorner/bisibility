import type { Prisma } from "@/lib/generated/prisma/client";
import { canonical, decode } from "@/lib/metering/store/codec";
import type { BillingImportRecord, Operation } from "@usagekit/core";
import { readNativeProof } from "./transport-proof-extension";

/** Only immutable atomic import records can supersede retained native provider-cost proof. */
export async function verifyMatchedOwnImports(tx: Prisma.TransactionClient, operation: Operation) {
  for (const [index, receipt] of operation.receipts.entries()) {
    if (receipt.source !== "import") continue;
    const [row] = await tx.$queryRaw<{ body: unknown }[]>`SELECT body FROM metering_import
      WHERE import_id=${receipt.evidenceRef ?? ""} AND namespace=${operation.scope.namespace}
        AND principal=${operation.scope.principal} AND connection=${operation.scope.connection}`;
    const record = row ? decode<BillingImportRecord>(row.body) : null;
    const prior = operation.receipts
      .slice(0, index)
      .find((candidate) => candidate.id === receipt.supersedes);
    const composed = record && receipt.id.startsWith(`${record.id}:native:`);
    const native = composed
      ? await readNativeProof(tx, operation, receipt.id.slice(`${record.id}:native:`.length))
      : null;
    const validDimensions = composed
      ? native &&
        prior?.source === "import" &&
        canonical(receipt.cost) === canonical(prior?.cost) &&
        canonical(
          receipt.measurements.filter((measurement) =>
            ["cents", "budget_cents"].includes(measurement.unit),
          ),
        ) ===
          canonical(
            prior?.measurements.filter((measurement) =>
              ["cents", "budget_cents"].includes(measurement.unit),
            ),
          ) &&
        canonical(
          receipt.measurements.filter(
            (measurement) => !["cents", "budget_cents", "paid_attempts"].includes(measurement.unit),
          ),
        ) ===
          canonical(
            native.measurements.filter(
              (measurement) =>
                !["cents", "budget_cents", "paid_attempts"].includes(measurement.unit),
            ),
          )
      : canonical(
          receipt.measurements.filter(
            (measurement) => !["cents", "budget_cents", "paid_attempts"].includes(measurement.unit),
          ),
        ) ===
        canonical(
          prior?.measurements.filter(
            (measurement) => !["cents", "budget_cents", "paid_attempts"].includes(measurement.unit),
          ),
        );
    if (
      !record ||
      !prior ||
      record.id !== receipt.evidenceRef ||
      (!composed &&
        (!receipt.id.startsWith(`${record.id}:receipt:`) ||
          !/^\d+$/.test(receipt.id.slice(`${record.id}:receipt:`.length)))) ||
      record.provider !== operation.provider ||
      record.scope.namespace !== operation.scope.namespace ||
      record.scope.principal !== operation.scope.principal ||
      record.scope.connection !== operation.scope.connection ||
      !record.matchedOperationIds.includes(operation.operationId) ||
      receipt.supersedes !== prior.id ||
      receipt.providerRequestId !== prior.providerRequestId ||
      Date.parse(prior.occurredAt) < Date.parse(record.window.from) ||
      Date.parse(prior.occurredAt) >= Date.parse(record.window.to) ||
      Date.parse(receipt.occurredAt) < Date.parse(record.window.from) ||
      Date.parse(receipt.occurredAt) >= Date.parse(record.window.to) ||
      receipt.cost.certainty !== "measured" ||
      !validDimensions
    )
      throw new Error("Original own-key invoice lacks durable matched import provenance");
  }
}
