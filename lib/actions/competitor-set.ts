"use server";

import {
  addManualCompetitorSchema,
  confirmSuggestedCompetitorSchema,
  dismissCompetitorSuggestionSchema,
  replaceCompetitorMarketsSchema,
  skipCompetitorSetupSchema,
  updateCompetitorAliasesSchema,
} from "@/lib/actions/competitor-set-input";
import { type AuditClient, requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { getCompetitorSuggestions } from "@/lib/competitors/suggestions";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, makePublicId } from "@/lib/db/public-id";
import { Prisma, ProjectMarketStatus } from "@/lib/generated/prisma/client";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateCompetitorViews,
} from "./_shared";

const competitorSelect = {
  aliases: true,
  domain: true,
  evidence: true,
  id: true,
  label: true,
  publicId: true,
  scopePolicy: true,
  source: true,
} as const;

type CompetitorRecord = {
  aliases: string[];
  domain: string;
  evidence: unknown;
  id: string;
  label: string | null;
  publicId: string | null;
  scopePolicy: "all_markets" | "selected_markets";
  source: "manual" | "suggested";
};

function requiredCompetitorId(value: string | null) {
  if (!value || !isPublicIdOfType(value, "cmp")) {
    throw new Error("Competitor public ID is not available.");
  }
  return value;
}

function publicCompetitor(competitor: CompetitorRecord) {
  return {
    aliases: competitor.aliases,
    domain: competitor.domain,
    evidence: competitor.evidence,
    id: requiredCompetitorId(competitor.publicId),
    label: competitor.label,
    scopePolicy: competitor.scopePolicy,
    source: competitor.source,
  };
}

function competitorAuditTarget(competitor: ReturnType<typeof publicCompetitor>) {
  return requiredPublicAuditId(competitor.id, "cmp", "Competitor");
}

async function competitorProjectScope(action: "create" | "update", projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, action, projectId, { type: "competitor" });
  return { actor, project };
}

async function findScopedCompetitor(
  client: Pick<typeof prisma, "competitor">,
  projectId: string,
  competitorId: string,
) {
  if (!isPublicIdOfType(competitorId, "cmp")) throw new Error("Competitor not found.");
  const competitor = await client.competitor.findFirst({
    select: competitorSelect,
    where: { projectId, publicId: competitorId },
  });
  if (!competitor) throw new Error("Competitor not found.");
  return competitor as CompetitorRecord;
}

async function recordSetupOutcome(
  client: Pick<typeof prisma, "project"> & AuditClient,
  project: { id: string; publicId: string },
  actorId: string,
  outcome: "confirmed" | "skipped",
) {
  await client.project.updateMany({
    data: { competitorSetupDecidedAt: new Date(), competitorSetupOutcome: outcome },
    where: {
      id: project.id,
      OR: [{ competitorSetupOutcome: null }, { NOT: { competitorSetupOutcome: outcome } }],
    },
  });
  await writeAudit(
    {
      action: outcome === "confirmed" ? "competitor.setup.confirm" : "competitor.setup.skip",
      actorId,
      after: { outcome },
      projectId: project.id,
      targetId: project.publicId,
      targetType: "project",
    },
    client,
  );
}

async function lockProjectForSetup(client: Pick<typeof prisma, "$queryRaw">, projectId: string) {
  await client.$queryRaw(
    Prisma.sql`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`,
  );
}

function afterMutation<T>(result: T) {
  revalidateCompetitorViews();
  return result;
}

export async function confirmSuggestedCompetitor(input: unknown) {
  const data = parseActionInput(confirmSuggestedCompetitorSchema, input);
  const { actor, project } = await competitorProjectScope("create", data.projectId);
  const result = await prisma.$transaction(async (tx) => {
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
    await recordSetupOutcome(tx, project, actor.id, "confirmed");
    return after;
  });
  return afterMutation(result);
}

export async function addManualCompetitor(input: unknown) {
  const data = parseActionInput(addManualCompetitorSchema, input);
  const { actor, project } = await competitorProjectScope("create", data.projectId);
  const result = await prisma.$transaction(async (tx) => {
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
    await recordSetupOutcome(tx, project, actor.id, "confirmed");
    return after;
  });
  return afterMutation(result);
}

export async function updateCompetitorAliases(input: unknown) {
  const data = parseActionInput(updateCompetitorAliasesSchema, input);
  const { actor, project } = await competitorProjectScope("update", data.projectId);
  const result = await prisma.$transaction(async (tx) => {
    const before = await findScopedCompetitor(tx, project.id, data.competitorId);
    const competitor = await tx.competitor.update({
      data: { aliases: data.aliases },
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
  return afterMutation(result);
}

export async function dismissCompetitorSuggestion(input: unknown) {
  const data = parseActionInput(dismissCompetitorSuggestionSchema, input);
  const { actor, project } = await competitorProjectScope("update", data.projectId);
  await prisma.$transaction(async (tx) => {
    await tx.competitorSuggestionDismissal.upsert({
      create: { domain: data.domain, projectId: project.id },
      update: {},
      where: { projectId_domain: { domain: data.domain, projectId: project.id } },
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
  });
  return afterMutation({ dismissed: true });
}

export async function skipCompetitorSetup(input: unknown) {
  const data = parseActionInput(skipCompetitorSetupSchema, input);
  const { actor, project } = await competitorProjectScope("update", data.projectId);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockProjectForSetup(tx, project.id);
    const hasEffectiveCompetitors =
      (await tx.competitor.count({ where: { projectId: project.id } })) > 0;
    const nextOutcome = hasEffectiveCompetitors ? "confirmed" : "skipped";
    await recordSetupOutcome(tx, project, actor.id, nextOutcome);
    return nextOutcome;
  });
  return afterMutation({ outcome });
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
  return afterMutation(result);
}
