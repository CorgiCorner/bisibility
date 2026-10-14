import "server-only";
import { normalizeSchedule } from "@/lib/actions/_schedule";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { assertDefinitionActor } from "@/lib/measurement-definitions/access";
import {
  consumeReviewedDefaultsAuthority,
  type ReviewedDefaultsPermit,
} from "@/lib/measurement-settings/host/defaults-permit";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { keywordMarketSelect, projectDefaultSerpMarket } from "@/lib/serp/default-market";
import type { ResolvedProjectDefaultMarket } from "@/lib/serp/project-default-market";
import { assertDefaultsProjectKey } from "./defaults-project-key";
import { projectDefaultsConfig } from "./project-defaults-config";
import { projectDefaultsUpsertArgs } from "./project-defaults-write";
import { DefaultsReviewRequiredError } from "./reviewed-defaults-contract";

/** Existing setter body in the caller transaction, so reviewed CAS and audit cannot split. */
export async function updateProjectDefaultsInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  project: { id: string; publicId: string },
  data: ProjectDefaultsInput,
  resolved: ResolvedProjectDefaultMarket,
  action:
    | "settings.defaults.update"
    | "settings.rank_check_frequency.update"
    | "project_defaults.update",
  permit: ReviewedDefaultsPermit,
  auditActorId: string | null = actorId,
  persistMarket = true,
) {
  const { principal, consent } = consumeReviewedDefaultsAuthority(permit, project.id, actorId);
  if (principal.kind === "project_key") {
    if (auditActorId !== null) throw new DefaultsReviewRequiredError();
    await assertDefaultsProjectKey(tx, principal.id, project, true, new Date());
  } else await assertDefinitionActor(tx, actorId, project.id, "update", "project_defaults");
  await lockProjectForProviderMutation(tx, project.id);
  const writable = await tx.project.findUnique({
    where: { id: project.id },
    select: { publicId: true, writeMode: true },
  });
  if (!writable || writable.publicId !== project.publicId || writable.writeMode !== "active")
    throw new ProjectReadOnlyError(project.id);
  const [before, keywords] = await Promise.all([
    tx.projectDefaults.findUnique({ where: { projectId: project.id } }),
    tx.keyword.findMany({ select: keywordMarketSelect, where: { projectId: project.id } }),
  ]);
  const market = {
    city: resolved.city,
    country: resolved.country,
    device: resolved.device,
    locationKey: resolved.locationKey,
  };
  const cadence = normalizeSchedule(data);
  const stored = await tx.projectDefaults.upsert(
    projectDefaultsUpsertArgs({
      defaults: { ...cadence, ...(persistMarket ? market : {}) },
      projectId: project.id,
      serpStopOnMatch: data.serpStopOnMatch,
    }),
  );
  await refreshKeywordDispatchStates({ inheritedProjectId: project.id }, tx);
  await writeAudit(
    {
      action,
      actorId: auditActorId,
      projectId: project.id,
      targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
      targetType: "project_defaults",
      before:
        action === "settings.rank_check_frequency.update"
          ? before
            ? projectDefaultsConfig(before)
            : null
          : {
              market: projectDefaultSerpMarket(before, keywords),
              schedule: before ? projectDefaultsConfig(before) : null,
            },
      after:
        action === "settings.rank_check_frequency.update"
          ? { ...projectDefaultsConfig(stored), consent }
          : { market, schedule: projectDefaultsConfig(stored), consent },
    },
    tx,
  );
  return stored;
}
