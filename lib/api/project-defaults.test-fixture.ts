import { AuthorizationError } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import type { DefaultsHostContext } from "@/lib/measurement-settings/host/defaults-authority";
import { verifyDefaultsWritePermit } from "@/lib/measurement-settings/host/defaults-permit";
import { signSettingsQuote } from "@/lib/measurement-settings/host/quote-binding";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { resolveProjectDefaultMarket } from "@/lib/serp/project-default-market";
import { publicProjectDefaults } from "@/lib/settings/project-defaults-config";
import { updateProjectDefaultsInTransaction } from "@/lib/settings/project-defaults-service";
import {
  defaultsRequestSchema,
  defaultsReviewSchema,
} from "@/lib/settings/reviewed-defaults-contract";

export const reviewedDefaultsApiBody = (values: Record<string, unknown>) => ({
  ...values,
  review: {
    expected_source_hash: "a".repeat(64),
    expected_revision: "1",
    preview_token: "synthetic-api-writer-port-only",
    idempotency_key: "synthetic-command-key",
    confirmed: true,
  },
});

/** Legacy market/serialization assertions use the real writer and one-use HMAC permit.
 * The real host handles missing review; its source CAS/replay is covered by defaults.postgres.test.ts. */
export async function reviewedDefaultsApiWriter(
  context: DefaultsHostContext,
  input: unknown,
  reviewInput: unknown,
) {
  if (
    context.credential?.kind !== "project_key" ||
    context.credential.id !== context.actor.id ||
    context.auditActorId !== null
  )
    throw new AuthorizationError("forbidden");
  const request = defaultsRequestSchema.parse(input);
  const review = defaultsReviewSchema.parse(reviewInput);
  if (review.previewToken !== "synthetic-api-writer-port-only")
    throw new Error("Unexpected writer-port fixture.");
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { publicId: request.values.projectId } });
    if (!project) throw new Error("Fixture project is unavailable.");
    const [before, keywords] = await Promise.all([
      tx.projectDefaults.findUnique({ where: { projectId: project.id } }),
      tx.keyword.findMany({ where: { projectId: project.id } }),
    ]);
    const current = projectDefaultSerpMarket(before, keywords);
    const values = request.values;
    const changesMarket =
      values.country !== undefined ||
      values.device !== undefined ||
      values.city !== undefined ||
      values.locationKey !== undefined;
    const data = projectDefaultsSchema.parse({
      ...values,
      projectId: project.publicId,
      country: values.country ?? current.country,
      device: values.device ?? current.device,
      city: values.city ?? (changesMarket ? null : current.city),
      locationKey:
        values.locationKey ?? (changesMarket ? undefined : (current.locationKey ?? undefined)),
      frequency: values.frequency,
      cronExpression: values.cronExpression,
      timezone: values.timezone,
      jitterMinutes: values.jitterMinutes,
      serpDepth: values.serpDepth ?? before?.serpDepth ?? 100,
      serpStopOnMatch: values.serpStopOnMatch ?? before?.serpStopOnMatch ?? true,
    });
    const resolved = changesMarket
      ? await resolveProjectDefaultMarket({ ...data, projectId: project.id })
      : {
          ...current,
          displayName: current.city ?? current.country,
          locationId: "synthetic-retained-market",
        };
    const binding = {
      projectId: project.id,
      actorId: context.actor.id,
      depth: data.serpDepth,
      providerId: null,
      source: { kind: "synthetic-api-writer-only" },
      selection: data,
    };
    const now = new Date();
    const quote = signSettingsQuote("defaults", binding, now);
    const permit = verifyDefaultsWritePermit("defaults", quote.token, binding, now, {
      kind: "project_key",
      id: context.actor.id,
    });
    const row = await updateProjectDefaultsInTransaction(
      tx,
      context.actor.id,
      project,
      data,
      resolved,
      "project_defaults.update",
      permit,
      null,
      changesMarket,
    );
    return {
      value: publicProjectDefaults(row, project.publicId),
      timestamps: {
        lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
        nextCheckAt: row.nextCheckAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      },
      market: changesMarket ? { ...resolved, source: "explicit" as const } : current,
    };
  });
}
