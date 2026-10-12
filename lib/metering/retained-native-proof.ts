import type { Prisma } from "@/lib/generated/prisma/client";
import { loadByokEvidence } from "@/lib/provider-usage/byok-evidence-storage";
import type { Receipt } from "@usagekit/core";
import { receiptFromEntry } from "./mapping";
import { canonical, decode, encode, hash } from "./store/codec";

export type RetainedNativeOwner = {
  attemptId: string;
  namespace: string;
  principal: string;
  connectionId: string;
  credentialVersion?: string | null;
};
const proofKey = (owner: RetainedNativeOwner, id: string) =>
  `retained-native:${hash(canonical([owner.namespace, owner.principal, owner.connectionId, owner.attemptId, owner.credentialVersion ?? null, id]))}`;
export async function readRetainedNativeProof(
  tx: Prisma.TransactionClient,
  owner: RetainedNativeOwner,
  id: string,
) {
  const [row] = await tx.$queryRaw<
    { body: unknown }[]
  >`SELECT value AS body FROM metering_metadata WHERE key=${proofKey(owner, id)}`;
  return row ? decode<Receipt>(row.body) : null;
}
/** Proof persistence shares the caller's transaction and never changes effective accounting. */
export async function retainNativeProof(
  tx: Prisma.TransactionClient,
  owner: RetainedNativeOwner,
  receipt: Receipt,
) {
  if (receipt.source === "import")
    throw new Error("Invoice projection cannot be retained as native proof");
  await tx.$executeRaw`INSERT INTO metering_metadata(key,value) VALUES(${proofKey(owner, receipt.id)},${encode(receipt)}) ON CONFLICT DO NOTHING`;
  const retained = await readRetainedNativeProof(tx, owner, receipt.id);
  const identity = ({ recordedAt: _, ...value }: Receipt) => value;
  if (!retained || canonical(identity(retained)) !== canonical(identity(receipt)))
    throw new Error("Original native proof identity conflicts");
  return retained;
}

export async function readNativeProof(
  tx: Prisma.TransactionClient,
  operation: Pick<import("@usagekit/core").Operation, "operationId" | "scope">,
  proofId: string,
) {
  const [retained] = await tx.$queryRaw<
    { body: unknown }[]
  >`SELECT r.body FROM metering_receipt r JOIN metering_operation o USING(operation_pk) WHERE o.namespace=${operation.scope.namespace} AND o.principal=${operation.scope.principal} AND o.operation_id=${operation.operationId} AND r.receipt_id=${proofId}`;
  if (retained) return decode<Receipt>(retained.body);
  const stored = await readRetainedNativeProof(
    tx,
    {
      attemptId: operation.operationId,
      namespace: operation.scope.namespace,
      principal: operation.scope.principal,
      connectionId: operation.scope.connection,
      credentialVersion: operation.scope.providerCredentialVersion,
    },
    proofId,
  );
  if (stored) return stored;
  const entry = await loadByokEvidence(tx, operation.operationId);
  if (
    !entry ||
    entry.namespace !== operation.scope.namespace ||
    entry.ownerId !== operation.scope.principal
  )
    return null;
  const receipt = receiptFromEntry(entry, new Date());
  return receipt.id === proofId ? receipt : null;
}
