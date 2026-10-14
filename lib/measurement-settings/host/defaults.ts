import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { LocationDescription, LocationSelection } from "@/lib/serp/location";
import { resolveKeywordLocationUsingStore } from "@/lib/serp/location-service";
import { createPrismaLocationStore } from "@/lib/serp/location-store";
import { updateProjectDefaultsInTransaction } from "@/lib/settings/project-defaults-service";
import {
  type DefaultsPreview,
  DefaultsReviewRequiredError,
  defaultsRequestSchema,
  defaultsReviewSchema,
} from "@/lib/settings/reviewed-defaults-contract";
import { type DefaultsHostContext, defaultsProjectScope } from "./defaults-authority";
import { verifyDefaultsWritePermit } from "./defaults-permit";
import {
  defaultsMutationScope,
  readDefaultsReceipt,
  writeDefaultsReceipt,
} from "./defaults-receipt";
import { prepareDefaultsDraft } from "./defaults-source";
import { SettingsHostError } from "./errors";
import { settingsHash } from "./hash";
import { signSettingsQuote } from "./quote-binding";
import { loadDefaultsIntentSource } from "./source";

type Database = Pick<PrismaClient, "$transaction">;
function exactLocationSelection(location: LocationDescription): LocationSelection {
  if (location.kind === "country") return { kind: "country", canonicalKey: location.canonicalKey };
  if (location.kind === "region") return { kind: "region", canonicalKey: location.canonicalKey };
  return { kind: "city", canonicalKey: location.canonicalKey };
}
function revision(source: Awaited<ReturnType<typeof loadDefaultsIntentSource>>) {
  if (source.policy.policyEpoch === null)
    throw new SettingsHostError("settings_revision_unavailable");
  return source.policy.policyEpoch;
}
function binding(
  source: Awaited<ReturnType<typeof loadDefaultsIntentSource>>,
  context: DefaultsHostContext,
  authority: string,
  request: ReturnType<typeof defaultsRequestSchema.parse>,
  prepared: Awaited<ReturnType<typeof prepareDefaultsDraft>>,
) {
  return {
    projectId: source.project.id,
    actorId: context.actor.id,
    depth: prepared.draft.serpDepth,
    providerId: null,
    selection: { request, draft: prepared.draft },
    source: {
      sourceHash: source.sourceHash,
      authority,
      location: prepared.described.location,
      policyEpoch: revision(source),
      impact: prepared.impact,
      action: context.action ?? "settings.defaults.update",
    },
  };
}
/** Non-paid future intent preview. It never persists a location, configures policy or starts a check. */
export function previewDefaultsHost(
  context: DefaultsHostContext,
  input: unknown,
  db: Database = prisma,
  now = new Date(),
): Promise<DefaultsPreview> {
  const request = defaultsRequestSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const source = await loadDefaultsIntentSource(tx, context, request.values.projectId, now);
      const prepared = await prepareDefaultsDraft(tx, source, request);
      const quote = signSettingsQuote(
        "defaults",
        binding(source, context, source.authority, request, prepared),
        now,
      );
      return {
        request,
        draft: prepared.draft,
        expectedRevision: revision(source),
        expectedSourceHash: source.sourceHash,
        previewToken: quote.token,
        expiresAt: quote.expiresAt,
        resolved: {
          locationKey: prepared.described.location.canonicalKey,
          label: prepared.described.location.displayName,
          languageCode: prepared.described.location.languageCode,
          device: prepared.draft.device,
        },
        impact: prepared.impact,
        policyReady: source.policy.state === "ready",
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 60_000 },
  );
}
export function saveDefaultsHost(
  context: DefaultsHostContext,
  input: unknown,
  reviewInput: unknown,
  db: Database = prisma,
  now = new Date(),
) {
  const request = defaultsRequestSchema.parse(input);
  const parsedReview = defaultsReviewSchema.safeParse(reviewInput);
  if (!parsedReview.success) throw new DefaultsReviewRequiredError();
  const review = parsedReview.data;
  return db.$transaction(
    async (tx) => {
      const { project, authority } = await defaultsProjectScope(
        tx,
        context,
        request.values.projectId,
        true,
        now,
      );
      const scope = defaultsMutationScope(project.id, context, request, review);
      const replay = await readDefaultsReceipt(tx, scope);
      if (replay) return replay; // Fresh authority precedes replay; expiry applies only to new writes.
      const source = await loadDefaultsIntentSource(tx, context, request.values.projectId, now);
      if (
        source.sourceHash !== review.expectedSourceHash ||
        revision(source) !== review.expectedRevision
      )
        throw new SettingsHostError("settings_conflict");
      const prepared = await prepareDefaultsDraft(tx, source, request);
      const permit = verifyDefaultsWritePermit(
        "defaults",
        review.previewToken,
        binding(source, context, authority, request, prepared),
        now,
        {
          kind: context.credential?.kind === "project_key" ? "project_key" : "user",
          id: context.actor.id,
        },
      );
      const persisted = await resolveKeywordLocationUsingStore(
        {
          projectId: project.id,
          selection: exactLocationSelection(prepared.described.location),
        },
        createPrismaLocationStore(tx),
      );
      const location = persisted.location;
      // The canonical winner may race. No stale description or changed catalog is silently committed.
      const { id: _id, ...description } = location;
      if (
        persisted.degraded ||
        settingsHash("defaults-location", description) !==
          settingsHash("defaults-location", prepared.described.location)
      )
        throw new SettingsHostError("settings_conflict");
      const stored = await updateProjectDefaultsInTransaction(
        tx,
        context.actor.id,
        project,
        prepared.draft,
        { ...prepared.described.market, locationId: location.id },
        context.action ?? "settings.defaults.update",
        permit,
        context.auditActorId,
        prepared.persistMarket,
      );
      const after = await loadDefaultsIntentSource(tx, context, request.values.projectId, now);
      return writeDefaultsReceipt(
        tx,
        scope,
        context,
        source.sourceHash,
        after.sourceHash,
        revision(after),
        stored,
        project.publicId,
        prepared.responseMarket,
      );
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
