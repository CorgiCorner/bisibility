"use server";

import {
  analyzeDomainOverview,
  loadDomainKeywordsPage,
  loadDomainOverviewHistory,
  loadDomainPagesPage,
} from "@/lib/domain-overview/service";
import { domainOverviewLocationCode } from "@/lib/domain-overview/target";
import { appPath } from "@/lib/routing/app-path";
import { saveSavedKeywordRows } from "@/lib/saved-keywords/service";
import { saveKeywordsSchema } from "@/lib/schemas/saved-keyword";
import { normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { supportsResearchMarket } from "@/lib/serp/market-capability";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const projectId = z.string().trim().min(1).max(120);
const target = z.string().trim().min(1).max(253);
const scopeOverride = z.enum(["root", "subdomain"]).optional();
const market = {
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  languageCode: z.string().trim().min(2).max(12),
  locationCode: z.number().int().positive(),
};
const maxCostCents = z.number().int().nonnegative();
const lookup = {
  fresh: z.boolean().default(false),
  projectId,
  scopeOverride,
  target,
  ...market,
};

const analyzeSchema = z
  .object({ estimateOnly: z.boolean(), maxCostCents: maxCostCents.optional(), ...lookup })
  .superRefine((data, context) => {
    if (!data.estimateOnly && data.maxCostCents === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A maximum cost is required for a paid domain overview lookup.",
        path: ["maxCostCents"],
      });
    }
  });
const historySchema = z.object({ ...lookup, maxCostCents });
const tablePageSchema = z.object({
  ...lookup,
  filters: z.record(z.string(), z.unknown()).default({}),
  limit: z.number().int().min(1).max(1_000),
  maxCostCents,
  offset: z.number().int().nonnegative(),
  sort: z.string().trim().max(120).optional(),
});
const saveSelectedSchema = saveKeywordsSchema.extend({
  languageCode: market.languageCode,
  locationCode: market.locationCode,
  scopeOverride,
  target,
});
const selectMarketSchema = z.object({
  canonicalKey: z.string().trim().min(2).max(180),
  projectId,
});

export type AnalyzeDomainOverviewAction = typeof analyzeDomainOverviewAction;
export type LoadDomainHistoryAction = typeof loadDomainHistoryAction;
export type LoadDomainKeywordsPageAction = typeof loadDomainKeywordsPageAction;
export type LoadDomainPagesPageAction = typeof loadDomainPagesPageAction;
export type SelectDomainOverviewMarketAction = typeof selectDomainOverviewMarketAction;
export type SaveSelectedKeywordsAction = typeof saveSelectedKeywordsAction;

async function mutationScope(data: { projectId: string }, type: "keyword" | "project" = "project") {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type });
  return { actor, project };
}

export async function analyzeDomainOverviewAction(input: unknown) {
  const data = parseActionInput(analyzeSchema, input);
  const { actor, project } = await mutationScope(data);
  return analyzeDomainOverview(
    { actorId: actor.id, projectId: project.id },
    {
      estimateOnly: data.estimateOnly,
      fresh: data.fresh,
      ...(data.countryCode ? { countryCode: data.countryCode } : {}),
      languageCode: data.languageCode,
      locationCode: data.locationCode,
      maxCostCents: data.maxCostCents,
      scopeOverride: data.scopeOverride,
      target: data.target,
    },
  );
}

export async function selectDomainOverviewMarketAction(input: unknown) {
  const data = parseActionInput(selectMarketSchema, input);
  const { project } = await mutationScope(data);
  const normalized = normalizeCanonicalLocationKey(data.canonicalKey);
  const resolved = await resolveKeywordLocation({
    projectId: project.id,
    selection: normalized.selector.cityName
      ? { canonicalKey: normalized.canonicalKey, kind: "city" }
      : {
          countryCode: normalized.selector.countryCode,
          kind: "country",
          languageCode: normalized.selector.languageCode,
        },
  });
  const locationCode = domainOverviewLocationCode(resolved.location);
  const supported =
    locationCode != null &&
    supportsResearchMarket(resolved.location.countryCode, resolved.location.languageCode);
  return {
    canonicalKey: resolved.location.canonicalKey,
    locationCode: supported ? locationCode : null,
    supported,
  };
}

export async function loadDomainHistoryAction(input: unknown) {
  const data = parseActionInput(historySchema, input);
  const { actor, project } = await mutationScope(data);
  return loadDomainOverviewHistory(
    { actorId: actor.id, projectId: project.id },
    {
      fresh: data.fresh,
      ...(data.countryCode ? { countryCode: data.countryCode } : {}),
      languageCode: data.languageCode,
      locationCode: data.locationCode,
      maxCostCents: data.maxCostCents,
      scopeOverride: data.scopeOverride,
      target: data.target,
    },
  );
}

async function loadTablePage(
  input: unknown,
  module: "keywords",
): ReturnType<typeof loadDomainKeywordsPage>;
async function loadTablePage(
  input: unknown,
  module: "pages",
): ReturnType<typeof loadDomainPagesPage>;
async function loadTablePage(input: unknown, module: "keywords" | "pages") {
  const data = parseActionInput(tablePageSchema, input);
  const { actor, project } = await mutationScope(data);
  const options = {
    fresh: data.fresh,
    ...(data.countryCode ? { countryCode: data.countryCode } : {}),
    languageCode: data.languageCode,
    limit: data.limit,
    locationCode: data.locationCode,
    maxCostCents: data.maxCostCents,
    offset: data.offset,
    scopeOverride: data.scopeOverride,
    target: data.target,
  };
  // sort and filters describe free client-side slicing of fetched rows; the paid cache key is
  // intentionally based only on provider pagination and market dimensions.
  return module === "keywords"
    ? loadDomainKeywordsPage({ actorId: actor.id, projectId: project.id }, options)
    : loadDomainPagesPage({ actorId: actor.id, projectId: project.id }, options);
}

export async function loadDomainKeywordsPageAction(input: unknown) {
  return loadTablePage(input, "keywords");
}

export async function loadDomainPagesPageAction(input: unknown) {
  return loadTablePage(input, "pages");
}

export async function saveSelectedKeywordsAction(input: unknown) {
  const data = parseActionInput(saveSelectedSchema, input);
  const { actor, project } = await mutationScope(data, "keyword");
  const { results: _results, ...outcome } = await saveSavedKeywordRows(data.rows, {
    actorId: actor.id,
    projectId: project.id,
    projectPublicId: project.publicId,
  });
  revalidatePath(appPath(project.publicId, "keywords"));
  revalidatePath(appPath(project.publicId, "domain-overview"));
  return outcome;
}
