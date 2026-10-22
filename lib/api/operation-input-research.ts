import { costEstimateQuerySchema } from "@/lib/cost-estimate/api-contract";
import {
  localPointHistorySchema,
  localPointReadSchema,
  localResultExportSchema,
  localResultReadSchema,
  localRunHistorySchema,
} from "@/lib/local-monitor-results/schema";
import { historyExportRequestSchema } from "@/lib/rank-history/report-export-model";
import { siteAuditSchema } from "@/lib/site-audit/schema";
import { z } from "zod";
import { snapshotQuery } from "./analytics";
import { queryStatsQuery } from "./analytics-query-stats";
import { analyzeQuerySchema, rowsBodySchema } from "./backlinks";
import {
  analyzeBodySchema,
  historyBodySchema,
  keywordPageBodySchema,
  relevantPageBodySchema,
} from "./domain-overview";
import { metricsBodySchema, researchQuerySchema } from "./keyword-research";
import { querySchema as locationQuerySchema } from "./locations";
import { noInput, type OperationInput, zodInput } from "./operation-input-helpers";
import { projectOverviewQuerySchema } from "./project-overview";
import { rankRunListQuerySchema } from "./rank-run-list-query";
import { querySchema as rankedKeywordQuerySchema } from "./ranked-keywords";
import {
  backlinksQuerySchema,
  domainOverviewQuerySchema,
  keywordResearchQuerySchema,
} from "./research-reports";
import { updateSchema as sitemapMonitorUpdateSchema } from "./sitemap-monitors";

/**
 * Research, analytics, local monitor, discovery and site audit operations. Query handlers that
 * build their input with `searchParams.get("snake_name")` under a camelCase key are registered
 * with the default camel naming; schemas keyed by the wire names use `keys: "wire"`.
 */

/** Local monitor reads validate one command that also carries the path parameters. */
const localMonitorServerKeys = ["monitorId", "projectId", "runId", "targetId"];

export const researchOperationInputs = {
  analyzeBacklinks: { query: zodInput(analyzeQuerySchema, { keys: "wire" }) },
  analyzeDomainOverview: { body: zodInput(analyzeBodySchema, { keys: "wire" }) },
  exportLocalMonitorRun: {
    query: zodInput(localResultExportSchema, {
      handlerDefaults: ["format", "version"],
      serverKeys: localMonitorServerKeys,
    }),
  },
  exportRankHistory: {
    // `format` falls back to the Accept header when the query omits it.
    query: zodInput(historyExportRequestSchema, {
      aliases: { keyword_id: "keywordIds" },
      handlerDefaults: ["format"],
    }),
  },
  getCapabilities: noInput,
  getCloudImportCompatibility: noInput,
  getCostEstimate: { query: zodInput(costEstimateQuerySchema, { keys: "wire" }) },
  getHealth: noInput,
  // Include the subsequent requireApiPublicId check; the handler does not stop at zod.
  getKeywordMetrics: {
    body: zodInput(
      metricsBodySchema.extend({
        connection_id: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^conn_[a-z][a-z0-9]{23}$/)
          .optional(),
      }),
      { keys: "wire" },
    ),
  },
  getLiveness: noInput,
  getLlmsTxt: noInput,
  getLocalMonitorRunResults: {
    query: zodInput(localResultReadSchema, { serverKeys: localMonitorServerKeys }),
  },
  getOpenApi: noInput,
  getProjectOverview: { query: zodInput(projectOverviewQuerySchema) },
  getProviderRates: noInput,
  getRankCheckRun: noInput,
  getReadiness: noInput,
  getSiteAudit: noInput,
  // One of the three schemas is selected by the `{kind}` path parameter.
  getStoredResearchReport: {
    query: zodInput(
      z.union([
        backlinksQuerySchema,
        domainOverviewQuerySchema,
        keywordResearchQuerySchema.extend({
          connection_id: z
            .string()
            .trim()
            .min(1)
            .max(120)
            .regex(/^conn_[a-z][a-z0-9]{23}$/)
            .optional(),
        }),
      ]),
      { keys: "wire" },
    ),
  },
  listLocalMonitorPointHistory: {
    query: zodInput(localPointHistorySchema, { serverKeys: localMonitorServerKeys }),
  },
  listLocalMonitorPointListings: {
    query: zodInput(localPointReadSchema, { serverKeys: localMonitorServerKeys }),
  },
  listLocalMonitorRuns: {
    query: zodInput(localRunHistorySchema, { serverKeys: localMonitorServerKeys }),
  },
  listRankCheckRuns: { query: zodInput(rankRunListQuerySchema, { keys: "wire" }) },
  // The handler validates a selected connection ID after parsing the query.
  listRankedKeywordSuggestions: {
    query: zodInput(
      rankedKeywordQuerySchema.extend({
        connectionId: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^conn_[a-z][a-z0-9]{23}$/)
          .optional(),
      }),
    ),
  },
  listSearchPerformanceQueryStats: { query: zodInput(queryStatsQuery) },
  listSiteAudits: noInput,
  listSitemapMonitors: noInput,
  listStoredResearchReports: noInput,
  // `path` is `getAll("path")`, an empty array when absent.
  listTrafficSnapshots: {
    query: zodInput(snapshotQuery, {
      aliases: { path: "paths" },
      handlerDefaults: ["path"],
    }),
  },
  loadDomainOverviewHistory: { body: zodInput(historyBodySchema, { keys: "wire" }) },
  loadDomainOverviewKeywords: { body: zodInput(keywordPageBodySchema, { keys: "wire" }) },
  loadDomainOverviewPages: { body: zodInput(relevantPageBodySchema, { keys: "wire" }) },
  loadMoreBacklinkRows: { body: zodInput(rowsBodySchema, { keys: "wire" }) },
  researchKeywords: { query: zodInput(researchQuerySchema, { handlerDefaults: ["result_limit"] }) },
  runSiteAudit: { body: zodInput(siteAuditSchema) },
  // `country` is passed as `get("country")`, so it is null rather than absent. A missing `q`
  // becomes "", which the schema rejects, so it stays required.
  searchLocations: {
    query: zodInput(locationQuerySchema, {
      aliases: { q: "query" },
      handlerDefaults: ["country"],
    }),
  },
  syncProjectTraffic: noInput,
  updateSitemapMonitor: { body: zodInput(sitemapMonitorUpdateSchema) },
} as const satisfies Record<string, OperationInput>;
