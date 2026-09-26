import "server-only";

import { prisma } from "@/lib/db/prisma";

export type DefaultProjectTarget = { id: string; publicId: string };

export function findDefaultProjectCandidate(projectId: string) {
  return prisma.project.findUnique({
    select: { id: true, onboardingCompletedAt: true, publicId: true },
    where: { publicId: projectId },
  });
}

/** Writes the user's default project and reports the previous public ID for the audit trail. */
export async function persistDefaultProject(userId: string, target: DefaultProjectTarget | null) {
  const existing = await prisma.user.findUnique({
    select: { defaultProject: { select: { publicId: true } }, publicId: true },
    where: { id: userId },
  });
  if (!existing?.publicId) {
    throw new Error("User public ID is not available.");
  }

  const previousProjectId = existing.defaultProject?.publicId ?? null;
  if (previousProjectId === (target?.publicId ?? null)) {
    return { changed: false, previousProjectId, publicId: existing.publicId };
  }

  await prisma.user.update({
    data: { defaultProjectId: target?.id ?? null },
    where: { id: userId },
  });
  return { changed: true, previousProjectId, publicId: existing.publicId };
}
