import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

export type OwnAttemptGrant = { attemptId: string; leaseId: string };
export type OwnAttemptInput = { id: string; credentialVersion: string | null; queued?: boolean };
export type OwnAdmissionPort = {
  reserve(
    tx: Prisma.TransactionClient,
    inputs: readonly OwnAttemptInput[],
  ): Promise<OwnAttemptGrant[]>;
  fence(db: PrismaClient, grants: readonly OwnAttemptGrant[]): Promise<void>;
  acknowledge(tx: Prisma.TransactionClient, id: string): Promise<boolean>;
  cancel(tx: Prisma.TransactionClient, ids: readonly string[]): Promise<void>;
  owns(db: Pick<PrismaClient, "$queryRaw">, id: string): Promise<boolean>;
  assertRetrieval(
    db: PrismaClient,
    connectionId: string,
    correlations: readonly string[],
  ): Promise<boolean>;
  recover(
    tx: Prisma.TransactionClient,
    connectionId: string,
    correlationId: string,
    receipt: import("@/lib/providers/usage").ProviderUsageReceipt,
  ): Promise<void>;
};
