import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { LaunchRankCheckRunInput } from "./launch-types";
/** Untrusted identity is used ONLY to recover an already committed, same-principal run.
 * It never authorizes creation: the new-run path still verifies full signed consent and TTL.
 */
export function paymentReplayQuoteId(token?: string) {
  try {
    if (!token || token.length > 12000) return null;
    const value = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    return typeof value.id === "string" && /^[a-f0-9-]{36}$/.test(value.id)
      ? (value.id as string)
      : null;
  } catch {
    return null;
  }
}
export async function findPaymentRunReplay(
  input: LaunchRankCheckRunInput,
  db: Prisma.TransactionClient = prisma,
) {
  const id = paymentReplayQuoteId(input.acceptedPayment?.quoteToken);
  if (!id) return null;
  const existing = await db.rankCheckRun.findFirst({
    where: {
      projectId: input.project.id,
      requestedById: input.actorId,
      source: input.origin.source,
      credentialKind: input.origin.credential?.kind ?? null,
      credentialId: input.origin.credential?.id ?? null,
      selectionSpec: { path: ["rankPaymentQuoteId"], equals: id },
    },
    select: {
      publicId: true,
      status: true,
      targetCount: true,
      keywordCount: true,
      estimatedCostCents: true,
    },
  });
  return existing
    ? { ...existing, status: existing.status as import("./contract").RunStatus }
    : null;
}
