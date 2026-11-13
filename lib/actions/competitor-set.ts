"use server";
import {
  addManualCompetitorSchema,
  confirmSuggestedCompetitorSchema,
  dismissCompetitorSuggestionSchema,
  replaceCompetitorMarketsSchema,
  skipCompetitorSetupSchema,
  updateCompetitorAliasesSchema,
} from "@/lib/actions/competitor-set-input";
import { recordAppAction } from "@/lib/activity/app-mutation";
import {
  brandNameDraftSchema,
  brandNameIdentityConflict,
} from "@/lib/ai-tracking/brand-name-schema";
import { writeAudit } from "@/lib/auth/audit";
import { withCapacityFailure } from "@/lib/capacity/action";
import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import { lockProjectForSetup, recordSetupOutcome } from "@/lib/competitors/setup-outcome";
import { getCompetitorSuggestions } from "@/lib/competitors/suggestions";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma, ProjectMarketStatus } from "@/lib/generated/prisma/client";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateCompetitorViews,
} from "./_shared";
import {
  type CompetitorRecord,
  competitorAuditTarget,
  competitorSelect,
  findScopedCompetitor,
  publicCompetitor,
} from "./competitor-set-record";

async function competitorProjectScope(action: "create" | "update", projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, action, projectId, { type: "competitor" });
  return { actor, project };
}

function afterMutation<T>(result: T) {
  revalidateCompetitorViews();
  return result;
}

export async function confirmSuggestedCompetitor(input: unknown) {
  return withCapacityFailure(async () => {
    const data = parseActionInput(confirmSuggestedCompetitorSchema, input);
    const { actor, project } = await competitorProjectScope("create", data.projectId);
    const result = await prisma.$transaction(async (tx) => {
      const capacity = await prepareResourceCapacity(tx, {
        projectId: project.id,
        dimensions: ["competitorsPerProject"],
      });
      const candidate = (await getCompetitorSuggestions(project.id, tx)).find(
        (suggestion) => suggestion.domain === data.domain,
      );
      if (!candidate) throw new Error("This competitor is not currently suggested.");
      const competitor = await tx.competitor.create({
        data: {
          domain: candidate.domain,
          evidence: candidate,
          projectId: project.id,
          publicId: makePublicId("cmp"),
          source: "suggested",
        },
        select: competitorSelect,
      });
      const after = publicCompetitor(competitor as CompetitorRecord);
      await writeAudit(
        {
          action: "competitor.suggestion.confirm",
          actorId: actor.id,
          after,
          projectId: project.id,
          targetId: competitorAuditTarget(after),
          targetType: "competitor",
        },
        tx,
      );
      await capacity.check();
      await recordSetupOutcome(tx, project, actor.id, "confirmed");
      return after;
    });
    recordAppAction(actor);
    return afterMutation(result);
  });
}

export async function addManualCompetitor(input: unknown) {
  return withCapacityFailure(async () => {
    const data = parseActionInput(addManualCompetitorSchema, input);
    const { actor, project } = await competitorProjectScope("create", data.projectId);
    const result = await prisma.$transaction(async (tx) => {
      const capacity = await prepareResourceCapacity(tx, {
        projectId: project.id,
        dimensions: ["competitorsPerProject"],
      });
      const competitor = await tx.competitor.create({
        data: {
          aliases: data.aliases,
          domain: data.domain,
          evidence: Prisma.DbNull,
          label: data.label ?? null,
          projectId: project.id,
          publicId: makePublicId("cmp"),
          source: "manual",
        },
        select: competitorSelect,
      });
      const after = publicCompetitor(competitor as CompetitorRecord);
      await writeAudit(
        {
          action: "competitor.manual.add",
          actorId: actor.id,
          after,
          projectId: project.id,
          targetId: competitorAuditTarget(after),
          targetType: "competitor",
        },
        tx,
      );
      await capacity.check();
      await recordSetupOutcome(tx, project, actor.id, "confirmed");
      return after;
    });
    recordAppAction(actor);
    return afterMutation(result);
  });
}

export async function updateCompetitorAliases(input: unknown) {
  const data = parseActionInput(updateCompetitorAliasesSchema, input);
  const { actor, project } = await competitorProjectScope("update", data.projectId);
  const result = await prisma.$transaction(async (tx) => {
    const before = await findScopedCompetitor(tx, project.id, data.competitorId);
    const excludedNames = data.excludedNames ?? before.excludedNames ?? [];
    const separated = brandNameDraftSchema.safeParse({ aliases: data.aliases, excludedNames });
    if (!separated.success) throw new Error(separated.error.issues[0].message);
    const identityConflict = brandNameIdentityConflict(excludedNames, before);
    if (identityConflict) throw new Error(identityConflict);
    const competitor = await tx.competitor.update({
      data: {
        aliases: data.aliases,
        ...(data.excludedNames !== undefined ? { excludedNames: data.excludedNames } : {}),
      },
      select: competitorSelect,
      where: { id: before.id },
    });
    const after = publicCompetitor(competitor as CompetitorRecord);
    await writeAudit(
      {
        action: "competitor.aliases.update",
        actorId: actor.id,
        after,
        before: publicCompetitor(before),
        projectId: project.id,
        targetId: competitorAuditTarget(after),
        targetType: "competitor",
      },
      tx,
    );
    return after;
  });
  recordAppAction(actor);
  const actionResult = await afterMutation(result);

  return actionResult;
}

export async function dismissCompetitorSuggestion(input: unknown) {
  const data = parseActionInput(dismissCompetitorSuggestionSchema, input);
  const { actor, project } = await competitorProjectScope("update", data.projectId);
  const changed = await prisma.$transaction(async (tx) => {
    const inserted = await tx.competitorSuggestionDismissal.createMany({
      data: [{ domain: data.domain, projectId: project.id }],
      skipDuplicates: true,
    });
    await writeAudit(
      {
        action: "competitor.suggestion.dismiss",
        actorId: actor.id,
        after: { domain: data.domain },
        projectId: project.id,
        targetId: project.publicId,
        targetType: "project",
      },
      tx,
    );
    return inserted.count;
  });
  if (changed > 0) recordAppAction(actor);
  const actionResult = await afterMutation({ dismissed: true });

  return actionResult;
}

export async function skipCompetitorSetup(input: unknown) {
  const data = parseActionInput(skipCompetitorSetupSchema, input);
  const { actor, project } = await competitorProjectScope("update", data.projectId);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockProjectForSetup(tx, project.id);
    const hasEffectiveCompetitors =
      (await tx.competitor.count({ where: { projectId: project.id } })) > 0;
    const nextOutcome = hasEffectiveCompetitors ? "confirmed" : "skipped";
    const changed = await recordSetupOutcome(tx, project, actor.id, nextOutcome);
    return { changed, nextOutcome };
  });
  if (outcome.changed > 0) recordAppAction(actor);
  const actionResult = await afterMutation({ outcome: outcome.nextOutcome });

  return actionResult;
}

export async function replaceCompetitorMarkets(input: unknown) {
  const data = parseActionInput(replaceCompetitorMarketsSchema, input);
  const { actor, project } = await competitorProjectScope("update", data.projectId);
  const result = await prisma.$transaction(async (tx) => {
    const before = await findScopedCompetitor(tx, project.id, data.competitorId);
    const markets = await tx.projectMarket.findMany({
      select: { id: true, publicId: true },
      where: {
        projectId: project.id,
        publicId: { in: data.marketIds },
        status: { in: [ProjectMarketStatus.active, ProjectMarketStatus.paused] },
      },
    });
    if (markets.length !== data.marketIds.length) throw new Error("Project market not found.");
    const mode = data.scopePolicy === "all_markets" ? "excluded" : "added";
    await tx.competitorMarketOverride.deleteMany({ where: { competitorId: before.id } });
    if (markets.length > 0) {
      await tx.competitorMarketOverride.createMany({
        data: markets.map((market) => ({
          competitorId: before.id,
          mode,
          projectMarketId: market.id,
        })),
      });
    }
    const competitor = await tx.competitor.update({
      data: { scopePolicy: data.scopePolicy },
      select: competitorSelect,
      where: { id: before.id },
    });
    const after = publicCompetitor(competitor as CompetitorRecord);
    await writeAudit(
      {
        action: "competitor.market_membership.replace",
        actorId: actor.id,
        after: {
          marketIds: markets.map((market) => market.publicId),
          scopePolicy: data.scopePolicy,
        },
        before: { scopePolicy: before.scopePolicy },
        projectId: project.id,
        targetId: competitorAuditTarget(after),
        targetType: "competitor",
      },
      tx,
    );
    return after;
  });
  recordAppAction(actor);
  const actionResult = await afterMutation(result);

  return actionResult;
}
