"use server";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { appPath } from "@/lib/routing/app-path";
import { SampleDataError } from "@/lib/sample-data/errors";
import { installSampleDataset } from "@/lib/sample-data/install";
import { isSampleProject } from "@/lib/sample-data/marker";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateRankCheckViews,
  revalidateSettingsViews,
} from "./_shared";

const removeSampleDataSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
});

type SampleProjectLookupClient = Pick<Prisma.TransactionClient, "membership">;

function revalidateSampleDataViews() {
  revalidateRankCheckViews();
  revalidateSettingsViews();
  revalidatePath("/app", "layout");
  revalidatePath("/onboarding");
}

async function findExistingSampleProject(client: SampleProjectLookupClient, actorId: string) {
  return client.membership.findFirst({
    orderBy: { createdAt: "asc" },
    select: { project: { select: { id: true, isSample: true, publicId: true } } },
    where: {
      project: { isSample: true },
      userId: actorId,
    },
  });
}

export async function installSampleData() {
  const actor = await getActionActor();
  authorize(actor, "create", { ownerId: actor.id, requiredRole: "member", type: "project" });

  const result = await prisma.$transaction(async (tx) => {
    const lockKey = `sample:${actor.id}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const existing = await findExistingSampleProject(tx, actor.id);
    if (existing) {
      return { installed: false, project: existing.project };
    }

    const project = await installSampleDataset(tx, actor.id);
    await writeAudit(
      {
        action: "sample_data.install",
        actorId: actor.id,
        after: { domain: project.domain, name: project.name, publicId: project.publicId },
        projectId: project.id,
        targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
        targetType: "project",
      },
      tx,
    );
    return { installed: true, project };
  });

  if (result.installed) {
    revalidateSampleDataViews();
  }

  redirect(appPath(result.project.publicId, "overview"));
}

export async function removeSampleData(input: unknown) {
  const data = parseActionInput(removeSampleDataSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, { type: "project" });

  if (!isSampleProject(project)) {
    throw new SampleDataError("not_sample_project");
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.delete({ where: { id: project.id } });
    await writeAudit(
      {
        action: "sample_data.remove",
        actorId: actor.id,
        before: { publicId: project.publicId },
        projectId: null,
        targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
        targetType: "project",
      },
      tx,
    );
  });
  revalidateSampleDataViews();

  return { projectId: project.publicId, publicId: project.publicId };
}
