import { prisma } from "@/lib/db/prisma";
import type { DefaultsHostContext } from "@/lib/measurement-settings/host/defaults-authority";
import { verifyDefaultsWritePermit } from "@/lib/measurement-settings/host/defaults-permit";
import { signSettingsQuote } from "@/lib/measurement-settings/host/quote-binding";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import { keywordMarketSelect, projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { resolveProjectDefaultMarket } from "@/lib/serp/project-default-market";
import { publicProjectDefaults } from "@/lib/settings/project-defaults-config";
import { updateProjectDefaultsInTransaction } from "@/lib/settings/project-defaults-service";
import {
  DefaultsReviewRequiredError,
  defaultsRequestSchema,
  defaultsReviewSchema,
} from "@/lib/settings/reviewed-defaults-contract";

/** Route/business fixture: real schema, catalog resolver, MAC permit and shared transactional writer.
 * The complete host revision/CAS/replay protocol is covered by defaults.postgres.test.ts. */
export async function projectsDefaultsPortFixture(
  context: DefaultsHostContext,
  requestInput: unknown,
  reviewInput?: unknown,
  preview = false,
) {
  if (!preview && !defaultsReviewSchema.safeParse(reviewInput).success)
    throw new DefaultsReviewRequiredError();
  const request = defaultsRequestSchema.parse(requestInput);
  const project = await prisma.project.findUniqueOrThrow({
    where: { publicId: request.values.projectId },
  });
  const before = await prisma.projectDefaults.findUnique({ where: { projectId: project.id } });
  const keywords = await prisma.keyword.findMany({
    select: keywordMarketSelect,
    where: { projectId: project.id },
  });
  const current = projectDefaultSerpMarket(before, keywords);
  const values = request.values;
  const persistMarket =
    request.kind === "form" ||
    [values.country, values.device, values.city, values.locationKey].some((v) => v !== undefined);
  const data = projectDefaultsSchema.parse({
    ...values,
    projectId: project.publicId,
    country: values.country ?? current.country,
    device: values.device ?? current.device,
    ...(persistMarket ? {} : { city: current.city, locationKey: current.locationKey }),
    serpDepth: values.serpDepth ?? before?.serpDepth ?? 100,
    serpStopOnMatch: values.serpStopOnMatch ?? before?.serpStopOnMatch ?? true,
  });
  const resolved = await resolveProjectDefaultMarket({ ...data, projectId: project.id });
  const binding = {
    projectId: project.id,
    actorId: context.actor.id,
    depth: data.serpDepth,
    providerId: null,
    source: { kind: "synthetic-reviewed-route-writer" },
    selection: { ...data, ...resolved },
  };
  const now = new Date();
  if (preview) {
    const quote = signSettingsQuote("defaults", binding, now);
    return { expectedRevision: "0", expectedSourceHash: "a".repeat(64), previewToken: quote.token };
  }
  const review = defaultsReviewSchema.parse(reviewInput);
  const permit = verifyDefaultsWritePermit("defaults", review.previewToken, binding, now, {
    kind: "project_key",
    id: context.actor.id,
  });
  const row = await prisma.$transaction((tx) =>
    updateProjectDefaultsInTransaction(
      tx,
      context.actor.id,
      project,
      data,
      resolved,
      "project_defaults.update",
      permit,
      context.auditActorId,
      persistMarket,
    ),
  );
  return {
    revision: "0",
    sourceHash: "a".repeat(64),
    value: publicProjectDefaults(row, project.publicId),
    market: persistMarket ? { ...resolved, source: "explicit" as const } : current,
    timestamps: {
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      nextCheckAt: row.nextCheckAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}
