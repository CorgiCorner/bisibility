import "server-only";

import { prisma } from "@/lib/db/prisma";
import { requireReadableProject } from "./_auth";

export async function listScheduleMemberCandidates(projectRef: string) {
  const { project } = await requireReadableProject(projectRef);
  const keywords = await prisma.keyword.findMany({
    orderBy: [{ text: "asc" }, { publicId: "asc" }],
    select: {
      checkSchedule: { select: { name: true, publicId: true } },
      device: true,
      locationRef: { select: { displayName: true } },
      publicId: true,
      tags: { select: { tag: { select: { name: true } } } },
      text: true,
    },
    where: { projectId: project.id },
  });
  return keywords.map((keyword) => ({
    device: keyword.device === "mobile" ? "Mobile" : "Desktop",
    market: keyword.locationRef.displayName,
    name: keyword.text,
    publicId: keyword.publicId,
    scheduleId: keyword.checkSchedule?.publicId ?? null,
    sourceName: keyword.checkSchedule?.name ?? null,
    tags: keyword.tags.map(({ tag }) => tag.name),
    targetCount: 1,
  }));
}
