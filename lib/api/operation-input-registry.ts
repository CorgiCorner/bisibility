import { addManagedCompetitorSchema } from "@/lib/competitors/types";
import { createProjectSavedViewSchema } from "@/lib/saved-views/model";
import { projectDefaultsPatchSchema } from "@/lib/schemas/project";
import { testProviderConnectionSchema } from "@/lib/schemas/provider";
import { alertCreateInput, alertUpdateInput } from "./alert-input";
import { consentUpdate } from "./analytics-consent";
import {
  cloudImportPackageSchema,
  importSessionChunkSchema,
  importSessionCreateSchema,
  importSessionFinalizeSchema,
} from "./instance-import";
import { keywordCreateBodySchema } from "./keyword-create-input";
import { keywordListQueryAliases, keywordListQuerySchema } from "./keyword-list-query";
import { mintTokenSchema } from "./migration-tokens";
import { preferencePatchSchema } from "./notification-prefs";
import { aiTrackingOperationInputs } from "./operation-input-ai-tracking";
import { noInput, type OperationInput, rawInput, zodInput } from "./operation-input-helpers";
import { researchOperationInputs } from "./operation-input-research";
import { pageQuery as sharedPageQuery } from "./pagination";
import { apiCreateProjectSchema, projectPatchSchema } from "./projects";
import { providerBudgetsPatchSchema } from "./provider-budgets";
import { connectProviderActionSchema, providerSettingsSchema } from "./provider-service";
import { pushTokenRegisterSchema } from "./push-tokens";
import { rankCheckListQuerySchema } from "./rank-check-list-query";
import { createSavedKeywordsSchema } from "./saved-keywords";
import {
  apiKeyCreateSchema,
  keywordBulkSchema,
  keywordMatchRequestSchema,
  keywordPatchSchema,
  meDeleteSchema,
  mePatchSchema,
  personalTokenCreateSchema,
  runRankCheckSchema,
  webhookCreateSchema,
  webhookPatchSchema,
} from "./schemas";
import { createSignalSchema } from "./signals";
import { inviteSchema, memberRoleSchema } from "./team";

/**
 * Maps every OpenAPI operationId to the request input its handler actually validates: a zod
 * schema per location (body, query), a raw marker for inputs read by hand, or `noInput`.
 * Path parameters and headers are not recorded. `openapi-request-conformance.test.ts` compares
 * these with the spec and fails when an entry names an operation the spec does not have; an
 * operation without an entry is reported as `no-validator` in its committed failure list.
 */

/** Schema keys that handlers fill in from the `{project_id}` / `{provider_id}` path. */
const projectKey = ["projectId"];
const providerKeys = ["projectId", "providerId"];
const pageQuery = rawInput("cursor", "limit");
/** Operations whose handler reads `limit`/`cursor` through `parsePageQuery` or `paginateArray`. */
const zodPage = zodInput(sharedPageQuery, { keys: "wire" });

export const operationInputs = {
  ...aiTrackingOperationInputs,
  ...researchOperationInputs,
  addCompetitor: { body: zodInput(addManagedCompetitorSchema, { serverKeys: projectKey }) },
  addKeywords: {
    body: zodInput(keywordCreateBodySchema, {
      keys: "wire",
      aliases: {
        "[].schedule.cron_expression": "cronExpression",
        "[].schedule.jitter_minutes": "jitterMinutes",
        "[].schedule.serp_depth": "serpDepth",
        "schedule.cron_expression": "cronExpression",
        "schedule.jitter_minutes": "jitterMinutes",
        "schedule.serp_depth": "serpDepth",
        "keywords[].schedule.cron_expression": "cronExpression",
        "keywords[].schedule.jitter_minutes": "jitterMinutes",
        "keywords[].schedule.serp_depth": "serpDepth",
      },
    }),
  },
  bulkUpdateKeywords: {
    body: zodInput(keywordBulkSchema, {
      keys: "wire",
      aliases: {
        "schedule.cron_expression": "cronExpression",
        "schedule.jitter_minutes": "jitterMinutes",
        "schedule.serp_depth": "serpDepth",
      },
    }),
  },
  connectProvider: { body: zodInput(connectProviderActionSchema, { serverKeys: providerKeys }) },
  createAlertRule: { body: zodInput(alertCreateInput, { serverKeys: projectKey }) },
  createApiKey: { body: zodInput(apiKeyCreateSchema) },
  createCloudImportSession: { body: zodInput(importSessionCreateSchema, { keys: "wire" }) },
  createPersonalAccessToken: { body: zodInput(personalTokenCreateSchema) },
  createProject: { body: zodInput(apiCreateProjectSchema) },
  createProjectApiKey: { body: zodInput(apiKeyCreateSchema) },
  createSavedKeywords: { body: zodInput(createSavedKeywordsSchema) },
  // The handler infers `config.surface` and defaults `config.version` before parsing.
  createSavedView: { body: zodInput(createProjectSavedViewSchema, { serverKeys: projectKey }) },
  createSignal: { body: zodInput(createSignalSchema) },
  createTeamInvite: { body: zodInput(inviteSchema, { serverKeys: projectKey }) },
  createWebhookEndpoint: { body: zodInput(webhookCreateSchema) },
  deleteDevicePushToken: noInput,
  deleteMe: { body: zodInput(meDeleteSchema) },
  deleteAlertRule: noInput,
  deleteKeyword: noInput,
  deleteProject: noInput,
  deleteProjectSavedKeyword: noInput,
  deleteProjectSavedView: noInput,
  deleteSavedView: noInput,
  deleteWebhookEndpoint: noInput,
  disconnectProvider: noInput,
  finalizeCloudImportSession: { body: zodInput(importSessionFinalizeSchema, { keys: "wire" }) },
  getAnalyticsConsent: noInput,
  getKeyword: noInput,
  getMe: noInput,
  getNotificationPreferences: noInput,
  getProject: noInput,
  getProjectDefaults: noInput,
  getRankCheckResult: noInput,
  // Its preprocess renames the top-level keys and adds the `__` bookkeeping keys.
  importCloudExport: {
    body: zodInput(cloudImportPackageSchema, {
      aliases: {
        alert_rules: "alertRules",
        exported_at: "exportedAt",
        notification_preferences: "notificationPreferences",
        project_id: "projectId",
        saved_views: "savedViews",
      },
      keys: "wire",
      serverKeys: ["__bodyExtra", "__packageExtra", "__sections"],
    }),
  },
  listDevicePushTokens: noInput,
  listAlertRules: { query: zodPage },
  listApiKeys: { query: pageQuery },
  listCompetitors: { query: zodPage },
  // The handler picks the first non-empty alias before parsing; see keyword-list-query.ts.
  listKeywords: {
    query: zodInput(keywordListQuerySchema, { aliases: keywordListQueryAliases, keys: "wire" }),
  },
  listMigrationTokens: noInput,
  listPersonalAccessTokens: noInput,
  listProjectApiKeys: { query: pageQuery },
  // Read on the personal access token path only; project keys get a single project.
  listProjects: { query: zodPage },
  listProviderBudgets: noInput,
  listProviders: { query: pageQuery },
  listRankChecks: { query: zodInput(rankCheckListQuerySchema, { keys: "wire" }) },
  listSavedKeywords: { query: zodPage },
  listSavedViews: { query: rawInput("cursor", "limit", "surface") },
  listSignals: { query: rawInput("cursor", "from", "limit", "source", "to", "type") },
  listTeamInvites: { query: pageQuery },
  listTeamMembers: { query: pageQuery },
  listTriggeredAlerts: { query: zodPage },
  listWebhookEndpoints: noInput,
  markProjectAlertsRead: noInput,
  matchProjectKeywords: { body: zodInput(keywordMatchRequestSchema) },
  mintMigrationToken: { body: zodInput(mintTokenSchema, { serverKeys: projectKey }) },
  muteTriggeredAlert: noInput,
  registerDevicePushToken: { body: zodInput(pushTokenRegisterSchema) },
  removeCompetitor: noInput,
  removeProjectCompetitor: noInput,
  removeTeamMember: noInput,
  resendTeamInvite: noInput,
  revokeApiKey: noInput,
  revokeMigrationToken: noInput,
  revokePersonalAccessToken: noInput,
  revokeProjectMigrationToken: noInput,
  revokeProjectTeamInvite: noInput,
  revokeTeamInvite: noInput,
  runRankCheck: { body: zodInput(runRankCheckSchema, { keys: "wire" }) },
  setKeywordTargetUrl: { body: zodInput(keywordPatchSchema, { keys: "wire" }) },
  testProviderConnection: {
    body: zodInput(testProviderConnectionSchema, { serverKeys: providerKeys }),
  },
  updateAlertRule: {
    body: zodInput(alertUpdateInput, { serverKeys: ["projectId", "ruleId"] }),
  },
  updateAnalyticsConsent: { body: zodInput(consentUpdate) },
  updateMe: { body: zodInput(mePatchSchema) },
  updateNotificationPreferences: { body: zodInput(preferencePatchSchema) },
  updateProject: { body: zodInput(projectPatchSchema) },
  // `review` is validated separately by `defaultsReviewSchema` when the patch is saved.
  updateProjectDefaults: {
    body: zodInput(projectDefaultsPatchSchema, { alsoReads: ["review"], serverKeys: projectKey }),
    query: rawInput("preview_only"),
  },
  updateProviderBudgets: { body: zodInput(providerBudgetsPatchSchema) },
  updateProviderSettings: { body: zodInput(providerSettingsSchema, { serverKeys: providerKeys }) },
  updateTeamMemberRole: { body: zodInput(memberRoleSchema) },
  updateWebhookEndpoint: { body: zodInput(webhookPatchSchema) },
  uploadCloudImportChunk: {
    body: zodInput(importSessionChunkSchema, { keys: "wire", serverKeys: ["__checksumValid"] }),
  },
} as const satisfies Record<string, OperationInput>;
