import type { Prisma } from "@/lib/generated/prisma/client";

export async function createRecoveryAdmissionFixture(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`CREATE TABLE provider_connection_recovery("connectionId" text primary key, "credentialVersion" text, "accountState" text, "currentIncidentId" text, version integer NOT NULL DEFAULT 1)`;
  await tx.$executeRaw`CREATE TABLE provider_account_incidents(id text primary key, "connectionId" text, "credentialVersion" text, scope jsonb, "startedAt" timestamp, "resolvedAt" timestamp)`;
}
