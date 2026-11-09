"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { domainRatingSettingsSchema } from "@/lib/domain-rating/settings";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

export async function setDomainRatingTracking(input: unknown) {
  const data = parseActionInput(domainRatingSettingsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "provider_connection",
  });
  await prisma.$transaction(async (tx) => {
    const before = await tx.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { domainRatingEnabled: true },
    });
    await tx.project.update({
      where: { id: project.id },
      data: { domainRatingEnabled: data.enabled },
    });
    await writeAudit(
      {
        action: "project.domain_rating.update",
        actorId: actor.id,
        projectId: project.id,
        targetId: project.publicId,
        targetType: "project",
        before: { enabled: before.domainRatingEnabled },
        after: { enabled: data.enabled },
      },
      tx,
    );
  });
  recordAppAction(actor);
  revalidatePath("/app", "layout");

  return { ok: true };
}
