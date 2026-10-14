import {
  getActionActor,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { prisma } from "@/lib/db/prisma";
import { verifyDefaultsWritePermit } from "@/lib/measurement-settings/host/defaults-permit";
import { signSettingsQuote } from "@/lib/measurement-settings/host/quote-binding";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import { resolveProjectDefaultMarket } from "@/lib/serp/project-default-market";
import { publicProjectDefaults } from "@/lib/settings/project-defaults-config";
import { updateProjectDefaultsInTransaction } from "@/lib/settings/project-defaults-service";

/** Legacy business assertions exercise the real shared writer with a real synthetic HMAC permit.
 * Full host CAS/replay and authorization are covered by defaults.postgres.test.ts, not this port fixture. */
export async function reviewedDefaultsWriterFixture(
  input: unknown,
  action:
    | "settings.defaults.update"
    | "settings.rank_check_frequency.update"
    | "project_defaults.update",
) {
  const data = projectDefaultsSchema.parse(input),
    actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const resolved = await resolveProjectDefaultMarket({ ...data, projectId: project.id });
  const binding = {
    projectId: project.id,
    actorId: actor.id,
    depth: data.serpDepth,
    providerId: null,
    source: { kind: "synthetic-writer-only" },
    selection: data,
  };
  const now = new Date(),
    signed = signSettingsQuote("defaults", binding, now);
  const permit = verifyDefaultsWritePermit("defaults", signed.token, binding, now);
  const row = await prisma.$transaction((tx) =>
    updateProjectDefaultsInTransaction(
      tx,
      actor.id,
      project,
      data,
      resolved,
      action,
      permit,
      actor.id,
      action !== "settings.rank_check_frequency.update",
    ),
  );
  revalidateSettingsViews();
  return {
    ...publicProjectDefaults(row, project.publicId),
    kind: "saved" as const,
    nextCheckAt: null,
  };
}
