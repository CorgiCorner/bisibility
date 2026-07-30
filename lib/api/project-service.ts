import "server-only";

import { normalizeSchedule } from "@/lib/actions/_schedule";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { createProjectSchema } from "@/lib/schemas/project";
import type { z } from "zod";
import { projectAuditResource } from "./audit-resources";
import { assertProjectCapacity } from "./resource-limits";

type CreateProjectData = z.infer<typeof createProjectSchema>;

const projectSelect = {
  createdAt: true,
  domain: true,
  id: true,
  isSample: true,
  name: true,
  ownerId: true,
  publicId: true,
  trackingScope: true,
  updatedAt: true,
  writeMode: true,
} as const;

/** Shared capped writer for the UI action and personal-token API. */
export async function createProjectRecord(data: CreateProjectData, ownerId: string) {
  const schedule = data.defaults ? normalizeSchedule(data.defaults) : null;
  return prisma.$transaction(async (tx) => {
    await assertProjectCapacity(tx, ownerId);
    const project = await tx.project.create({
      data: {
        defaults: schedule ? { create: schedule } : undefined,
        domain: data.domain,
        members: { create: { publicId: makePublicId("mbr"), role: "owner", userId: ownerId } },
        name: data.name,
        ownerId,
        publicId: makePublicId("prj"),
        trackingScope: data.trackingScope,
      },
      select: projectSelect,
    });

    await writeAudit(
      {
        action: "project.create",
        actorId: ownerId,
        after: projectAuditResource(project),
        projectId: project.id,
        targetId: project.publicId,
        targetType: "project",
      },
      tx,
    );

    return project;
  });
}
