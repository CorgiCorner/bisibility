"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { normalizeDomain } from "@/lib/domains/normalize";
import { domainSchema, trackedProjectDomain } from "@/lib/schemas/project";
import { z } from "zod";

const idSchema = z.string().trim().min(1).max(120);
const rawDomainSchema = z.string().trim().min(1).max(253);

const normalizedDomainSchema = rawDomainSchema.transform((value, context) => {
  const normalized = normalizeDomain(value);
  const parsed = normalized ? domainSchema.safeParse(normalized) : null;
  if (!parsed?.success) {
    context.addIssue({
      code: "custom",
      message: "Enter a domain such as example.com.",
    });
    return z.NEVER;
  }
  return parsed.data;
});

const projectDomainChangeSchema = z.object({
  confirmationDomain: z.string().trim().max(253),
  newDomain: normalizedDomainSchema,
  projectId: idSchema,
});

export async function confirmProjectDomainChange(input: unknown) {
  const data = parseActionInput(projectDomainChangeSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const before = await prisma.project.findUnique({
    select: { domain: true, publicId: true },
    where: { id: project.id },
  });
  if (!before) {
    throw new Error("Project not found.");
  }

  const persistedDomain = trackedProjectDomain(before.domain);
  const currentDomain = persistedDomain ? normalizeDomain(persistedDomain) : null;
  const confirmationDomain = normalizeDomain(data.confirmationDomain);
  const auditAction = currentDomain
    ? "settings.project_domain.update"
    : "settings.project_domain.set";
  if (!currentDomain && data.confirmationDomain) {
    throw new Error(
      "This project has no configured domain. Leave the confirmation blank to set its first domain.",
    );
  }
  if (currentDomain && confirmationDomain !== currentDomain) {
    throw new Error("Confirmation domain does not match this project.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.project.updateMany({
      data: { domain: data.newDomain },
      where: { domain: before.domain, id: project.id },
    });
    if (result.count !== 1) {
      throw new Error("The project domain changed before confirmation. Try again.");
    }

    const after = { domain: data.newDomain, publicId: before.publicId };
    await writeAudit(
      {
        action: auditAction,
        actorId: actor.id,
        after,
        before,
        projectId: project.id,
        targetId: requiredPublicAuditId(before.publicId, "prj", "Project"),
        targetType: "project",
      },
      tx,
    );
    return after;
  });
  revalidateSettingsViews();

  return { domain: updated.domain, projectId: updated.publicId };
}
