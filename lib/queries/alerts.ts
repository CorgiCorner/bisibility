import "server-only";

import type { AlertTargetOptions } from "@/lib/alerts/alert-data";
import { getRequestAlertKeywordData } from "@/lib/alerts/alert-request-data";
import {
  alertDepthConflict,
  minimumTargetedDepth,
  type TargetedDepthKeyword,
} from "@/lib/alerts/depth-conflict";
import { privateNetworkAllowed } from "@/lib/alerts/webhook-target";
import {
  type AlertFeedQuery,
  listAlertRuleViews,
  listTriggeredAlertViews,
} from "@/lib/api/alert-list";
import { listWebhookEndpointsWithHistory } from "@/lib/api/webhook-service";
import { prisma } from "@/lib/db/prisma";
import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import {
  type FeedFacet,
  type FeedFacetOptions,
  type FeedFacetSearch,
  feedFacetValues,
  parseFeedFacets,
} from "@/lib/feeds/facets";
import type { AlertSeverity, Prisma } from "@/lib/generated/prisma/client";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject } from "./_auth";

function requiredPublicId(value: string | null, prefix: PublicIdPrefix, resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

type FeedMarket = { id: string; label: string; language: string; locationId: string };

function marketScopeLabel(marketIds: readonly string[], markets: AlertTargetOptions["markets"]) {
  if (!marketIds.length) return "All markets";
  const labels = marketIds
    .map((marketId) => markets.find((market) => market.id === marketId)?.label)
    .filter((label): label is string => Boolean(label));
  return labels.length === 1 ? labels[0] : `${marketIds.length} markets`;
}

function alertFacetOptions(markets: readonly FeedMarket[]): FeedFacetOptions {
  return {
    engine: [{ label: "Google", value: "google" }],
    language: Array.from(new Set(markets.map((market) => market.language))).map((language) => ({
      label: language,
      value: language,
    })),
    market: markets.map(({ id, label }) => ({ label, value: id })),
    module: [{ label: "Rank", value: "rank" }],
    severity: ["urgent", "warning", "info"].map((severity) => ({
      label: severity[0].toUpperCase() + severity.slice(1),
      value: severity,
    })),
  };
}

function alertFacetQuery(
  facets: readonly FeedFacet[],
  markets: readonly FeedMarket[],
): AlertFeedQuery {
  const marketLocationIds = new Map(markets.map((market) => [market.id, market.locationId]));
  const languageLabels = new Map(
    markets.map((market) => [market.language.toLocaleLowerCase("en-US"), market.language]),
  );
  const where: Prisma.TriggeredAlertWhereInput[] = [];
  const marketIds = feedFacetValues(facets, "market");
  const language = feedFacetValues(facets, "language");
  const severity = feedFacetValues(facets, "severity");

  if (marketIds.length) {
    where.push({
      keyword: { locationId: { in: marketIds.flatMap((id) => marketLocationIds.get(id) ?? []) } },
    });
  }
  if (language.length) {
    where.push({
      keyword: {
        locationRef: {
          languageLabel: { in: language.flatMap((value) => languageLabels.get(value) ?? []) },
        },
      },
    });
  }
  if (severity.length) where.push({ rule: { severity: { in: severity as AlertSeverity[] } } });

  return {
    marketsByLocation: new Map(markets.map((market) => [market.locationId, market])),
    where,
  };
}

async function loadTargets(projectId: string) {
  const [keywordData, tags, members, webhookEndpoints, markets] = await Promise.all([
    getRequestAlertKeywordData(projectId),
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, publicId: true },
      where: { projectId },
    }),
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { email: true, id: true, name: true, publicId: true },
      where: {
        OR: [{ projects: { some: { id: projectId } } }, { memberships: { some: { projectId } } }],
      },
    }),
    listWebhookEndpointsWithHistory(projectId),
    prisma.projectMarket.findMany({
      include: { location: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: { projectId, status: "active" },
    }),
  ]);

  return {
    depthKeywords: keywordData.keywords.map(
      (keyword): TargetedDepthKeyword => ({
        id: requiredPublicId(keyword.publicId, "kw", "Keyword"),
        projectDepth: keywordData.projectDepth,
        scheduleDepth: keyword.schedule?.serpDepth,
        tagIds: keyword.tags.flatMap((tag) =>
          tag.tag ? [requiredPublicId(tag.tag.publicId, "tag", "Tag")] : [],
        ),
      }),
    ),
    options: {
      keywords: keywordData.keywords.map((keyword) => ({
        id: requiredPublicId(keyword.publicId, "kw", "Keyword"),
        label: keyword.text,
      })),
      markets: markets.map((market) => ({
        canonicalKey: market.location.canonicalKey,
        id: requiredPublicId(market.publicId, "pmkt", "Project market"),
        label: `${market.location.displayName} / ${market.location.languageLabel}`,
      })),
      members: members.map((user) => ({
        id: requiredPublicId(user.publicId, "usr", "User"),
        label: `${user.name} (${user.email})`,
      })),
      tags: tags.map((tag) => ({
        id: requiredPublicId(tag.publicId, "tag", "Tag"),
        label: tag.name,
      })),
      webhookEndpoints: webhookEndpoints.map(
        ({ deliveryAttempts, description, enabled, lastDeliveryAt, publicId, url }) => ({
          deliveryAttempts: deliveryAttempts.map((attempt) => ({
            attemptedAt: attempt.attemptedAt.toISOString(),
            error: attempt.error,
            event:
              attempt.triggeredAlert.rankCheck?.trigger === "scheduled"
                ? ("alert.digest" as const)
                : ("alert.fired" as const),
            status: attempt.status,
          })),
          description,
          enabled,
          id: requiredPublicId(publicId, "we", "Webhook endpoint"),
          lastDeliveryAt: lastDeliveryAt?.toISOString() ?? null,
          url,
        }),
      ),
      webhookPrivateNetworkAllowed: privateNetworkAllowed({}),
    } satisfies AlertTargetOptions,
    feedMarkets: markets.map((market) => ({
      id: requiredPublicId(market.publicId, "pmkt", "Project market"),
      label: `${market.location.displayName} / ${market.location.languageLabel}`,
      language: market.location.languageLabel,
      locationId: market.locationId,
    })) satisfies FeedMarket[],
  };
}

export async function getAlertsView(projectId: string, searchParams: FeedFacetSearch = {}) {
  const { project } = await requireReadableProject(projectId);
  const targets = await loadTargets(project.id);
  const facetOptions = alertFacetOptions(targets.feedMarkets);
  const { facets } = parseFeedFacets(searchParams, facetOptions);
  const [rules, alerts] = await Promise.all([
    listAlertRuleViews(project.id),
    listTriggeredAlertViews(project.id, alertFacetQuery(facets, targets.feedMarkets)),
  ]);

  return {
    alerts,
    facetOptions,
    facets,
    project: { ...project, id: project.publicId },
    rules: rules.map((rule) => ({
      ...rule,
      depthConflict: alertDepthConflict(rule, minimumTargetedDepth(rule, targets.depthKeywords)),
      marketScope: marketScopeLabel(rule.marketIds, targets.options.markets),
    })),
    targets: { ...targets.options, projectDomain: trackedProjectDomain(project.domain) ?? "" },
  };
}
