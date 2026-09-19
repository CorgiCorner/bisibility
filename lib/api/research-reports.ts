import "server-only";

import { findStoredBacklinks, listStoredBacklinks } from "@/lib/backlinks/stored";
import { RESEARCH_FRESHNESS_DAYS } from "@/lib/demo/research-storage";
import { findStoredDomainOverview, listStoredDomainOverviews } from "@/lib/domain-overview/stored";
import { keywordResearchProject, researchLocation } from "@/lib/keyword-research/context";
import {
  canonicalKeywordResearchRequest,
  keywordResearchRequestKey,
} from "@/lib/keyword-research/request-key";
import {
  findStoredKeywordResearch,
  listStoredKeywordResearch,
} from "@/lib/keyword-research/stored-read";
import { z } from "zod";
import type { ApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { dataResponse, errorResponse } from "./responses";
import { scopedProject, snakeizeKeys } from "./surface";

export { RESEARCH_FRESHNESS_DAYS };

const falseParam = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const trueParam = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const backlinksQuerySchema = z.object({
  include_subdomains: trueParam,
  mode: z.enum(["as_is", "one_per_domain"]).default("as_is"),
  target: z.string().trim().min(1),
  target_scope: z.enum(["site", "page"]).default("site"),
});

const domainOverviewQuerySchema = z.object({
  language_code: z.string().trim().min(2).max(12),
  location_code: z.coerce.number().int().positive(),
  target: z.string().trim().min(1).max(253),
  target_scope: z.enum(["root", "subdomain"]).default("root"),
});

const keywordResearchQuerySchema = z.object({
  connection_id: z.string().trim().min(1).max(120).optional(),
  include_clickstream: falseParam,
  mode: z.enum(["auto", "ideas", "related", "suggestions"]).default("auto"),
  result_limit: z.coerce
    .number()
    .pipe(z.union([z.literal(100), z.literal(300), z.literal(500)]))
    .default(100),
  seed: z.string().trim().min(1).max(80),
});

function queryValue(ctx: ApiContext, name: string) {
  return ctx.url.searchParams.get(name) ?? undefined;
}

function parseQuery<Schema extends z.ZodTypeAny>(ctx: ApiContext, schema: Schema, keys: string[]) {
  return schema.parse(Object.fromEntries(keys.map((key) => [key, queryValue(ctx, key)])));
}

function freshnessState(stale: boolean) {
  return stale ? "stale" : "fresh";
}

function storedNotFound(ctx: ApiContext) {
  return errorResponse("not_found", "No stored research report matches this request.", 404, {
    headers: ctx.headers,
    instance: ctx.instance,
  });
}

function storedReportResponse(
  ctx: ApiContext,
  report: { stale: boolean } & Record<string, unknown>,
  dataState?: "no_data" | "ok" | "partial",
) {
  const { ok: _ok, ...data } = report;
  const preserved = dataState === undefined ? {} : { data_state: dataState };
  return dataResponse(
    snakeizeKeys({ ...data, ...preserved, state: freshnessState(report.stale) }),
    { headers: ctx.headers },
  );
}

async function storedBacklinksReport(ctx: ApiContext) {
  const input = parseQuery(ctx, backlinksQuerySchema, [
    "include_subdomains",
    "mode",
    "target",
    "target_scope",
  ]);
  const report = await findStoredBacklinks({
    includeSubdomains: input.include_subdomains,
    mode: input.mode,
    projectId: ctx.auth.project.id,
    target: input.target,
    targetScope: input.target_scope,
  });
  return report ? storedReportResponse(ctx, report) : storedNotFound(ctx);
}

async function storedDomainOverviewReport(ctx: ApiContext) {
  const input = parseQuery(ctx, domainOverviewQuerySchema, [
    "language_code",
    "location_code",
    "target",
    "target_scope",
  ]);
  const report = await findStoredDomainOverview({
    languageCode: input.language_code,
    locationCode: input.location_code,
    projectId: ctx.auth.project.id,
    scope: input.target_scope,
    target: input.target,
  });
  return report ? storedReportResponse(ctx, report, report.state) : storedNotFound(ctx);
}

async function storedKeywordResearchReport(ctx: ApiContext) {
  const input = parseQuery(ctx, keywordResearchQuerySchema, [
    "connection_id",
    "include_clickstream",
    "mode",
    "result_limit",
    "seed",
  ]);
  const project = await keywordResearchProject(ctx.auth.project.id);
  if (!project) return storedNotFound(ctx);
  const location = await researchLocation(project);
  const requestKey = keywordResearchRequestKey(
    canonicalKeywordResearchRequest({
      connectionPublicId: input.connection_id
        ? requireApiPublicId(input.connection_id, "conn")
        : undefined,
      countryCode: location.value.gl,
      includeClickstream: input.include_clickstream,
      languageCode: location.value.hl,
      mode: input.mode,
      resultLimit: input.result_limit,
      seed: input.seed,
    }),
  );
  const report = await findStoredKeywordResearch({
    projectId: ctx.auth.project.id,
    requestKey,
  });
  return report ? storedReportResponse(ctx, report) : storedNotFound(ctx);
}

export async function listStoredResearchReports(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const internalId = ctx.auth.project.id;
  const [backlinks, overviews, research] = await Promise.all([
    listStoredBacklinks({ projectId: internalId }),
    listStoredDomainOverviews({ projectId: internalId }),
    listStoredKeywordResearch({ projectId: internalId }),
  ]);
  return dataResponse(
    [
      ...backlinks.map((entry) => ({
        kind: "backlinks" as const,
        target: entry.target,
        target_scope: entry.targetScope,
        mode: entry.mode,
        include_subdomains: entry.includeSubdomains,
        saved_at: entry.savedAt,
        fresh_until: entry.freshUntil,
        state: freshnessState(entry.stale),
      })),
      ...overviews.map((entry) => ({
        kind: "domain_overview" as const,
        target: entry.target,
        target_scope: entry.scope,
        language_code: entry.languageCode,
        location_code: entry.locationCode,
        saved_at: entry.savedAt,
        fresh_until: entry.freshUntil,
        state: freshnessState(entry.stale),
      })),
      ...research.map((entry) => ({
        kind: "keyword_research" as const,
        seed: entry.seed,
        mode: entry.mode,
        country_code: entry.countryCode,
        language_code: entry.languageCode,
        include_clickstream: entry.includeClickstream,
        result_limit: entry.resultLimit,
        saved_at: entry.savedAt,
        fresh_until: entry.freshUntil,
        state: freshnessState(entry.stale),
      })),
    ],
    { headers: ctx.headers, meta: { freshness_days: RESEARCH_FRESHNESS_DAYS } },
  );
}

export async function getStoredResearchReport(ctx: ApiContext, projectId: string, kind: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  if (kind === "backlinks") return storedBacklinksReport(ctx);
  if (kind === "domain_overview") return storedDomainOverviewReport(ctx);
  if (kind === "keyword_research") return storedKeywordResearchReport(ctx);
  return storedNotFound(ctx);
}
