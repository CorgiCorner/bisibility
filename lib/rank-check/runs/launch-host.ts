import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { VerifiedManualConsent } from "@/lib/measurement-settings/host/reviewed-consent";
/** Optional server-only composition. No client command can install a callback or change native custody. */
export type RankRunHostBoundary = Readonly<{
  assertActor?: (tx: Prisma.TransactionClient) => Promise<void>;
  assertAdmission?: (tx: Prisma.TransactionClient) => Promise<void | VerifiedManualConsent>;
  assertReplay?: (
    client: Pick<Prisma.TransactionClient, "rankCheckRun">,
    key: string | undefined,
  ) => Promise<void>;
  attribution?: Readonly<{ actorScopeHash: string; bodyHash: string }>;
}>;
