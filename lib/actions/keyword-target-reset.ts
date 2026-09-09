"use server";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireKeywordScope,
  revalidateKeywordViews,
} from "./_shared";

const resetKeywordTargetSchema = z
  .object({ keywordId: z.string().trim().min(1).max(120) })
  .strict();

export type ResetKeywordTargetToInheritInput = z.infer<typeof resetKeywordTargetSchema>;

export async function resetKeywordTargetToInherit(input: unknown) {
  const data = parseActionInput(resetKeywordTargetSchema, input);
  const actor = await getActionActor();
  const keyword = await requireKeywordScope(actor, "update", data.keywordId);
  const updated = await prisma.$transaction(async (tx) => {
    const before = await tx.keyword.findUnique({
      select: { targetUrl: true },
      where: { id: keyword.id },
    });
    if (!before) throw new Error("Keyword not found.");
    const row = await tx.keyword.update({
      data: { targetUrl: null },
      select: { publicId: true, targetUrl: true },
      where: { id: keyword.id },
    });
    await writeAudit(
      {
        action: "keyword.target_url_reset",
        actorId: actor.id,
        after: { targetUrl: null },
        before: { targetUrl: before.targetUrl },
        projectId: keyword.projectId,
        targetId: row.publicId,
        targetType: "keyword",
      },
      tx,
    );
    return row;
  });
  revalidateKeywordViews(updated.publicId);
  return { keywordId: updated.publicId, targetUrl: updated.targetUrl };
}
