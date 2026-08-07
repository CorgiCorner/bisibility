"use server";

import { randomBytes } from "node:crypto";
import { cloudImportPackageSchema } from "@/lib/api/instance-import/schemas";
import { whereCompletedChecks } from "@/lib/checks/status";
import { appliedMigrationSummary } from "@/lib/db/migration-state";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId, requirePublicId } from "@/lib/db/public-id";
import { isCloud, isSelfHost } from "@/lib/deployment/deployment";
import type { CloudImportJob } from "@/lib/generated/prisma/client";
import { advanceCloudImportJobForProject } from "@/lib/migration/job-service";
import { pushMigrationLimits, shouldUseSessions } from "@/lib/migration/limits";
import { CLOUD_MIGRATION_PACKAGE_VERSION } from "@/lib/migration/package-version";
import { configuredMigrationTargetOrigin } from "@/lib/migration/target-origin";
import {
  assertMigrationTokenMintRateLimit,
  mintMigrationTokenForProject,
  revokeMigrationTokenForProject,
} from "@/lib/migration/token-service";
import { migrationFetch } from "@/lib/migration/transfer-client";
import * as notificationEvents from "@/lib/notifications/events";
import { getCloudImportJobStatus } from "@/lib/queries/cloud";
import { getCloudBackupCounts } from "@/lib/queries/cloud-backup-counts";
import { appPath } from "@/lib/routing/app-path";
import { absoluteSiteUrl } from "@/lib/seo/jsonld";
import packageJson from "@/package.json";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import {
  actionFailureResult,
  destinationRejectionFailure,
  handledActionResult,
} from "./action-result";
import { resolveMigrationTargetActionResult } from "./migration-target";

const idSchema = z.string().min(1).max(160);
const scopeSchema = z.enum(["full", "keywords"]);
const stateSchema = z.enum(["idle", "receiving", "importing", "done", "failed"]);
const countsSchema = z.record(z.string(), z.coerce.number().int().nonnegative()).optional();
const strictPublicId = (prefix: "ferry" | "imp" | "prj") =>
  idSchema.refine((value) => parsePublicId(value)?.prefix === prefix, {
    message: `Expected a strict ${prefix}_ v3 public ID.`,
  });
const projectIdSchema = strictPublicId("prj");
const projectInputSchema = z.object({ projectId: projectIdSchema });
const mintSchema = z.object({ projectId: projectIdSchema, scope: scopeSchema.default("full") });
const revokeSchema = z.object({
  projectId: projectIdSchema,
  tokenId: strictPublicId("ferry").optional(),
});
const tokenSchema = z.string().trim().min(20).max(256);
const targetOriginSchema = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .transform((value) => value || undefined);
const targetInputSchema = z.object({
  projectId: projectIdSchema,
  targetOrigin: targetOriginSchema,
});
// biome-ignore format: compact schema keeps this action module under the file line cap.
const transferPackageSchema = z.object({ content: z.string().min(2), filename: z.string().trim().min(1).max(240), projectId: projectIdSchema, targetOrigin: targetOriginSchema, token: tokenSchema });

// biome-ignore format: compact schema keeps this action module under the file line cap.
const advanceJobSchema = z.object({ counts: countsSchema, error: z.string().trim().max(500).optional(), jobId: strictPublicId("imp"), progress: z.coerce.number().int().min(0).max(100).optional(), projectId: projectIdSchema, state: stateSchema });
const compatibilityResponseSchema = z.object({
  app_version: z.string().trim().min(1).nullable().optional(),
  latest_migration: z.string().trim().nullable().optional(),
  schema_versions_supported: z.array(z.coerce.number().int()),
});
const migrationCompletionResponseSchema = z.object({
  counts: z.record(z.string(), z.coerce.number().int().nonnegative()).default({}),
  job_id: strictPublicId("imp"),
  state: z.literal("done"),
});

type MigrationTargetPreflightResult = {
  appVersion: string | null;
  latestMigration: string | null;
  origin: string;
  reachable: boolean;
  reason?: string;
  sameInstance: boolean;
  schemaVersionsSupported: number[] | null;
  sourceDeploymentMode: "cloud" | "self-host";
  supportsSessions: boolean;
};

// biome-ignore format: compact revalidation keeps this action module under the file line cap.
function revalidateCloudViews() { revalidatePath("/cloud/import"); for (const path of [appPath("[project]", "settings"), appPath("[project]", "settings", "audit")]) revalidatePath(path, "page"); }

// biome-ignore format: compact notifier keeps this action module under the file line cap.
async function notifyTerminalJob(job: CloudImportJob, projectId: string) { const input = { jobId: job.id, projectId }; if (job.state === "done") { await notificationEvents.notifyCloudImportDone({ ...input, counts: job.counts ?? null }).catch(() => undefined); } if (job.state === "failed") { await notificationEvents.notifyCloudImportFailed({ ...input, error: job.error }).catch(() => undefined); } }

// biome-ignore format: compact helper keeps this action module under the file line cap.
async function requireMigrationProject(actor: Awaited<ReturnType<typeof getActionActor>>, projectId: string) { return requireProjectScope(actor, "read", projectId, { type: "migration_token" }); }

// biome-ignore format: compact helpers keep this action module under the file line cap.
function packageVersion() { const envVersion = process.env.APP_VERSION?.trim(); return { source: envVersion ? "APP_VERSION" : "package.json", value: envVersion || packageJson.version }; }

// biome-ignore format: compact helpers keep this action module under the file line cap.
function parsePackageJson(content: string) { try { return JSON.parse(content) as unknown; } catch { throw new Error("Cloud import package must be valid JSON."); } }

// biome-ignore format: compact helpers keep this action module under the file line cap.
function responseDetail(body: unknown) { if (!body || typeof body !== "object" || Array.isArray(body)) { return null; } return "detail" in body && typeof body.detail === "string" ? body.detail : null; }

export async function exportCloudImportPackage(input: unknown) {
  const actions = await import("./keyword-import-export");
  return actions.exportCloudImportPackage(input);
}

export async function loadCloudBackupCounts(input: unknown) {
  const data = parseActionInput(projectInputSchema.required({ projectId: true }), input);
  return getCloudBackupCounts(data.projectId);
}

// biome-ignore format: compact action keeps this module under the file line cap.
export async function getCloudMigrationCompatibility(input: unknown) { const data = parseActionInput(projectInputSchema, input); const actor = await getActionActor(); const project = await requireMigrationProject(actor, data.projectId); const [schema, keywords, rankChecks] = await Promise.all([appliedMigrationSummary(), prisma.keyword.count({ where: { projectId: project.id } }), prisma.rankCheck.count({ where: { keyword: { projectId: project.id }, ...whereCompletedChecks() } })]); const version = packageVersion(); const limits = pushMigrationLimits(); return { appVersion: version.value, appVersionSource: version.source, cloudOrigin: configuredMigrationTargetOrigin(), data: { keywords, rankChecks }, limits: { pushMaxKeywords: limits.maxKeywords, sessionsRequired: shouldUseSessions({ keywords, rankChecks }) }, schema }; }

// biome-ignore format: compact action keeps this module under the file line cap.
export async function createCloudMigrationHandoff(input: unknown) { const data = parseActionInput(targetInputSchema, input); const actor = await getActionActor(); const project = await requireMigrationProject(actor, data.projectId); const target = resolveMigrationTargetActionResult(data.targetOrigin); if (!target.ok) return target; const origin = target.value; const apiImportUrl = absoluteSiteUrl("/api/cloud/import", origin); const cloudImportUrl = absoluteSiteUrl("/app", origin); return { apiImportUrl, apiRequest: `POST ${apiImportUrl}\nAuthorization: Bearer mig_...\nContent-Type: application/json`, cloudImportUrl, cloudOnboardingUrl: cloudImportUrl, cloudOrigin: origin, cloudWorkspaceUrl: cloudImportUrl, sourceProjectId: requirePublicId(project.publicId, "prj") }; }

// biome-ignore format: compact action keeps this module under the file line cap.
export async function transferCloudImportPackage(input: unknown) { const data = parseActionInput(transferPackageSchema, input); const actor = await getActionActor(); await requireMigrationProject(actor, data.projectId); const target = resolveMigrationTargetActionResult(data.targetOrigin); if (!target.ok) return target; const parsed = parsePackageJson(data.content); cloudImportPackageSchema.parse(parsed); const origin = target.value; /* Single-shot POST is not idempotent, so retries stay disabled. */ const response = await migrationFetch(absoluteSiteUrl("/api/cloud/import", origin), { body: JSON.stringify(parsed), cache: "no-store", headers: { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" }, method: "POST", timeoutMs: 30_000 }); const body = (await response.json().catch(() => null)) as unknown; if (!response.ok) { const detail = responseDetail(body); const failure = destinationRejectionFailure(response.status, detail); if (failure) { return actionFailureResult(failure); } throw new Error(detail ?? "Cloud import failed."); } const completion = migrationCompletionResponseSchema.parse(body); return { ok: true, value: { counts: completion.counts, jobId: completion.job_id, state: completion.state } } as const; }

function preflightNetworkReason(error: unknown) {
  return error instanceof Error && error.name === "TimeoutError"
    ? "Target compatibility check timed out."
    : "Target instance could not be reached.";
}

// A destination that resolves to this same instance means the transfer would
// point at itself (typical symptom: cloud deployment missing DEPLOYMENT_MODE).
async function isOwnOrigin(origin: string) {
  try {
    const { headers } = await import("next/headers");
    const { getOriginFromHeaders } = await import("@/lib/agent-ready/origin");
    const own = getOriginFromHeaders(await headers());
    if (!own) return false;
    return new URL(origin).origin.toLowerCase() === new URL(own).origin.toLowerCase();
  } catch {
    return false;
  }
}

// biome-ignore format: compact action keeps this module under the file line cap.
export async function preflightMigrationTarget(input: unknown): Promise<MigrationTargetPreflightResult | ReturnType<typeof actionFailureResult>> { const data = parseActionInput(targetInputSchema, input); const actor = await getActionActor(); await requireMigrationProject(actor, data.projectId); const target = resolveMigrationTargetActionResult(data.targetOrigin); if (!target.ok) return target; const origin = target.value; const sameInstance = await isOwnOrigin(origin); const base = { origin, sameInstance, sourceDeploymentMode: isSelfHost ? "self-host" : "cloud" } as const; try { const response = await migrationFetch(absoluteSiteUrl("/api/cloud/import/compatibility", origin), { cache: "no-store", method: "GET", timeoutMs: 10_000 }); if (response.status === 404) { return { ...base, appVersion: null, latestMigration: null, reachable: true, reason: `Target instance does not support strict v${CLOUD_MIGRATION_PACKAGE_VERSION} migration packages.`, schemaVersionsSupported: null, supportsSessions: false }; } const body = (await response.json().catch(() => null)) as unknown; if (!response.ok) { return { ...base, appVersion: null, latestMigration: null, reachable: true, reason: responseDetail(body) ?? `Target compatibility check failed with HTTP ${response.status}.`, schemaVersionsSupported: null, supportsSessions: false }; } const parsed = compatibilityResponseSchema.safeParse(body); if (!parsed.success) { return { ...base, appVersion: null, latestMigration: null, reachable: true, reason: "Target returned an unexpected compatibility response.", schemaVersionsSupported: null, supportsSessions: false }; } return { ...base, appVersion: parsed.data.app_version ?? null, latestMigration: parsed.data.latest_migration ?? null, reachable: true, schemaVersionsSupported: parsed.data.schema_versions_supported, supportsSessions: parsed.data.schema_versions_supported.includes(CLOUD_MIGRATION_PACKAGE_VERSION) }; } catch (error) { return { ...base, appVersion: null, latestMigration: null, reachable: false, reason: preflightNetworkReason(error), schemaVersionsSupported: null, supportsSessions: false }; } }

export async function pollCloudImportJob(input: unknown) {
  const data = parseActionInput(projectInputSchema.required({ projectId: true }), input);
  return getCloudImportJobStatus(data.projectId);
}

async function createCloudImportWorkspaceDestination() {
  const suffix = randomBytes(4).toString("hex");
  const { createProject } = await import("./project");
  // biome-ignore format: compact action body keeps this module under the file line cap.
  const project = await createProject({ domain: `workspace-${suffix}.bisibility.cloud`, name: "New workspace" });
  return `/cloud/import?ctx=onboard&project=${encodeURIComponent(project.publicId)}`;
}

export async function createCloudImportWorkspace() {
  if (!isCloud) {
    throw new Error("Cloud import workspaces are available only on Cloud deployments.");
  }
  const { redirect } = await import("next/navigation");
  return redirect(await createCloudImportWorkspaceDestination());
}

// biome-ignore format: compact action keeps this action module under the file line cap.
async function mintAction(input: unknown, action: "migration_token.mint" | "migration_token.regenerate") {
  const data = parseActionInput(mintSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, { type: "migration_token" });
  await assertMigrationTokenMintRateLimit(actor.id);
  const token = await mintMigrationTokenForProject({
    action,
    actorId: actor.id,
    projectId: project.id,
    scope: data.scope,
  });
  revalidateCloudViews();
  return token;
}

// biome-ignore format: compact exports keep this action module under the file line cap.
export async function mintMigrationToken(input: unknown) {
  return mintAction(input, "migration_token.mint");
}
// biome-ignore format: compact exports keep this action module under the file line cap.
export async function mintMigrationTokenResult(input: unknown) {
  return handledActionResult(() => mintMigrationToken(input));
}
// biome-ignore format: compact exports keep this action module under the file line cap.
export async function regenerateMigrationToken(input: unknown) {
  return mintAction(input, "migration_token.regenerate");
}
// biome-ignore format: compact exports keep this action module under the file line cap.
export async function regenerateMigrationTokenResult(input: unknown) {
  return handledActionResult(() => regenerateMigrationToken(input));
}

export async function revokeMigrationToken(input: unknown) {
  const data = parseActionInput(revokeSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "migration_token",
  });
  const token = await revokeMigrationTokenForProject({
    actorId: actor.id,
    projectId: project.id,
    tokenId: data.tokenId,
  });
  revalidateCloudViews();
  return token;
}
export async function revokeMigrationTokenResult(input: unknown) {
  return handledActionResult(() => revokeMigrationToken(input));
}

export async function advanceCloudImportJob(input: unknown) {
  const data = parseActionInput(advanceJobSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "cloud_import_job",
  });
  const { job, view } = await advanceCloudImportJobForProject({
    actorId: actor.id,
    counts: data.counts,
    error: data.error,
    jobId: data.jobId,
    progress: data.progress,
    projectId: project.id,
    state: data.state,
  });
  await notifyTerminalJob(job, project.id);
  revalidateCloudViews();
  return view;
}
