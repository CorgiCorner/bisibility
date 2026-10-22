import "server-only";
import { prisma } from "@/lib/db/prisma";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { snapshotExtensionWasNotSent } from "./snapshot-extension-proof";
import { snapshotExtensionView } from "./snapshot-extension-state";

/** A raw retryable flag alone never authorizes retry or a not-sent explanation. */
export async function loadSnapshotExtensionView(input: {
  projectId: string;
  checkId: string;
  provider: string;
  raw: unknown;
}) {
  const fallback = snapshotExtensionView(input.provider, input.raw);
  if (fallback.reason !== "failed") return fallback;
  try {
    return await prisma.$transaction(async (tx) => {
      await lockProjectForProviderMutation(tx, input.projectId);
      const check = await tx.rankCheck.findFirst({
        where: {
          publicId: input.checkId,
          keyword: { projectId: input.projectId },
          status: "completed",
        },
        select: { id: true, keywordId: true, provider: true, raw: true },
      });
      if (!check) return fallback;
      const current = snapshotExtensionView(check.provider, check.raw);
      if (current.reason !== "failed") return current;
      return (await snapshotExtensionWasNotSent(tx, input.projectId, check))
        ? { ...current, reason: "not_sent" as const }
        : current;
    });
  } catch {
    return fallback;
  }
}
