import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
export async function readDeploymentRecoveryProof(
  _tx: Prisma.TransactionClient,
  _namespace: string,
  _operationId: string,
) {
  return { available: false, accepted: false };
}
export async function recoverDeploymentProof(
  _tx: Prisma.TransactionClient,
  _namespace: string,
  _operationId: string,
) {
  throw new Error("Platform recovery requires wallet coordination");
}
