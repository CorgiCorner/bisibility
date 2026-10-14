import type { Actor } from "@/lib/auth/authorize";
import type { AuditRequestContext } from "@/lib/auth/request-context";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { RetainedProjectReadAuthority } from "@/lib/rank-history/retained-read-authority";

/** Supplied by authenticated server transport, never parsed from mutation JSON. */
export type BusinessStoreContext = Readonly<{
  actor: Actor | null;
  requestContext?: AuditRequestContext;
  readAuthority?: RetainedProjectReadAuthority;
}>;
export type BusinessTransaction = Prisma.TransactionClient;
export type BusinessDatabase = Pick<PrismaClient, "$transaction">;
