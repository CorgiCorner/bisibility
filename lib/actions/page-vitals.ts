"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { auditTargets, checkPageVitals, selectedTargets } from "@/lib/pagespeed/check";
import type { PageVitalsActionResult } from "@/lib/pagespeed/view";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { appPath } from "@/lib/routing/app-path";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { listSiteAudits, readSiteAudit } from "@/lib/site-audit/service";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const projectSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
});

const selectedSchema = projectSchema.extend({
  paths: z.array(z.string().trim().min(1).max(2048)).min(1).max(25),
});

type ScopedProject = {
  domain: string | null;
  id: string;
  publicId: string;
  writeMode?: unknown;
};

function revalidateProject(publicId: string) {
  revalidatePath(appPath(publicId, "pages"));
  revalidatePath(appPath(publicId, "site-audit"));
}

async function authorize(projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", projectId, { type: "project" });
  assertProjectWritable(project);
  return { actor, project: project as ScopedProject };
}

async function pageSpeedKey(projectId: string) {
  const connection = await prisma.providerConnection.findFirst({
    select: { credentialsEncrypted: true },
    where: { enabled: true, projectId, provider: "pagespeed", status: "connected" },
  });
  if (!connection?.credentialsEncrypted) return null;
  return decryptProviderCredentials(connection.credentialsEncrypted).apiKey ?? null;
}

async function finish(
  actor: { id: string },
  project: ScopedProject,
  scope: "audit" | "pages",
  result: PageVitalsActionResult,
) {
  recordAppAction(actor);
  await writeAudit({
    action: "page_vitals.check",
    actorId: actor.id,
    after: { checked: result.checked, code: result.ok ? "ok" : result.code, scope },
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });
  revalidateProject(project.publicId);
  return result;
}

/** Checks Core Web Vitals for the current site-audit sample, at most 15 pages. */
export async function checkSiteAuditVitalsAction(input: unknown) {
  const data = parseActionInput(projectSchema, input);
  const { actor, project } = await authorize(data.projectId);
  const key = await pageSpeedKey(project.id);
  if (!key)
    return finish(actor, project, "audit", { checked: 0, code: "not_connected", ok: false });
  const domain = trackedProjectDomain(project.domain);
  const history = domain ? await listSiteAudits(project.id) : [];
  const saved = domain && history[0] ? await readSiteAudit(project.id, history[0].id) : null;
  const targets = domain && saved ? auditTargets(domain, saved.result.pages) : [];
  if (!domain || targets.length === 0) {
    return finish(actor, project, "audit", { checked: 0, code: "no_sample", ok: false });
  }
  const checked = await checkPageVitals({
    apiKey: key,
    projectId: project.id,
    store: prisma,
    targets,
  });
  return finish(
    actor,
    project,
    "audit",
    checked.code === "ok"
      ? { checked: checked.checked, ok: true }
      : { checked: checked.checked, code: checked.code, ok: false },
  );
}

/** Checks Core Web Vitals for selected Pages rows, at most 25 URLs. */
export async function checkSelectedPageVitalsAction(input: unknown) {
  const data = parseActionInput(selectedSchema, input);
  const { actor, project } = await authorize(data.projectId);
  const key = await pageSpeedKey(project.id);
  if (!key)
    return finish(actor, project, "pages", { checked: 0, code: "not_connected", ok: false });
  const domain = trackedProjectDomain(project.domain);
  const pages = domain
    ? await prisma.projectPage.findMany({
        select: { id: true, path: true },
        where: { path: { in: [...data.paths] }, projectId: project.id },
      })
    : [];
  const targets = domain ? selectedTargets(domain, pages, data.paths) : [];
  if (!domain || targets.length === 0) {
    return finish(actor, project, "pages", { checked: 0, code: "no_sample", ok: false });
  }
  const checked = await checkPageVitals({
    apiKey: key,
    projectId: project.id,
    store: prisma,
    targets,
  });
  return finish(
    actor,
    project,
    "pages",
    checked.code === "ok"
      ? { checked: checked.checked, ok: true }
      : { checked: checked.checked, code: checked.code, ok: false },
  );
}
