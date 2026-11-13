import { BRAND_NAME_ANSWER_LIMIT } from "@/lib/ai-tracking/brand-name-projection";
import { prisma } from "@/lib/db/prisma";

export type BrandNameAnswerWindow = {
  from?: Date;
  to?: Date;
};

/** Stored answer texts only. Does not read or write observation rows. */
export async function listStoredBrandAnswers(projectId: string, window?: BrandNameAnswerWindow) {
  const finishedAt =
    window?.from || window?.to
      ? { ...(window.from ? { gte: window.from } : {}), ...(window.to ? { lte: window.to } : {}) }
      : undefined;
  const rows = await prisma.aiTrackingSample.findMany({
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    select: { answerText: true },
    take: BRAND_NAME_ANSWER_LIMIT,
    where: {
      answerText: { not: null },
      measurement: "answer_present",
      projectId,
      ...(finishedAt ? { finishedAt } : {}),
    },
  });
  return rows.flatMap((row) => (typeof row.answerText === "string" ? [row.answerText] : []));
}
