import "server-only";
import { definitionProjectScope } from "@/lib/measurement-definitions/access";
import { readHostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-snapshot";
import { definitionSourceSchema } from "@/lib/measurement-definitions/schema";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import type { SettingsHostContext, SettingsHostTransaction } from "./contracts";
import { type DefaultsHostContext, defaultsProjectScope } from "./defaults-authority";
import { SettingsHostError } from "./errors";
import { settingsHash } from "./hash";

const MAX_TARGETS = 10_000;
/** One semantic snapshot, no observation/raw read, resolver, initializer, admission or provider I/O. */
async function loadSource(
  tx: SettingsHostTransaction,
  context: SettingsHostContext,
  projectRef: string,
  scheduleRef: string | null,
  defaultsIntentOnly = false,
  authorized?: Awaited<ReturnType<typeof defaultsProjectScope>>,
) {
  const project =
    authorized?.project ??
    (await definitionProjectScope(tx, context, projectRef, "read", "project_defaults"));
  const policy = await readHostPolicySnapshot(tx, project.id);
  if (!defaultsIntentOnly && policy.state !== "ready")
    throw new SettingsHostError(
      policy.state === "unconfigured"
        ? "measurement_policy_unconfigured"
        : "measurement_policy_unsupported",
    );
  const [defaults, schedules, connectionRows, markets, chain, rows] = await Promise.all([
    tx.projectDefaults.findUnique({ where: { projectId: project.id } }),
    tx.checkSchedule.findMany({
      where: { projectId: project.id, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { publicId: "asc" }],
    }),
    tx.providerConnection.findMany({
      where: { projectId: project.id, kind: "serp" },
      select: { provider: true, enabled: true, status: true },
    }),
    tx.projectMarket.findMany({
      where: { projectId: project.id, status: "active" },
      include: { location: true },
    }),
    loadSerpProviderChain(project.id, undefined, tx),
    tx.$queryRaw<
      Array<{ source: unknown }>
    >`SELECT measurement_definition_source(${project.id},k.id) AS source
      FROM keywords k WHERE k."projectId"=${project.id} AND k."archivedAt" IS NULL ORDER BY k.id LIMIT ${MAX_TARGETS + 1}`,
  ]);
  if (rows.length > MAX_TARGETS) throw new SettingsHostError("source_unavailable");
  const targets = rows.map((row) => {
    const parsed = definitionSourceSchema.safeParse(row.source);
    if (!parsed.success) throw new SettingsHostError("source_unavailable");
    return parsed.data;
  });
  if (targets.some((row) => row.projectId !== project.id))
    throw new SettingsHostError("source_unavailable");
  const schedule = scheduleRef
    ? schedules.find((row) => row.publicId === scheduleRef)
    : schedules.find((row) => row.isDefault);
  if (scheduleRef && !schedule) throw new SettingsHostError("source_unavailable");
  const membership = authorized
    ? null
    : await tx.membership.findFirst({
        where: { projectId: project.id, userId: context.actor.id },
        select: { role: true },
      });
  const role = authorized?.role ?? membership?.role;
  if (!role) throw new SettingsHostError("source_unavailable");
  const priceInputs = chain.map((row) => ({
    connectionId: row.id,
    provider: row.provider,
    credentialSource: row.credentialSource,
    credentialVersion:
      row.credentialSource === "own" && row.id
        ? ownCredentialVersion(row.provider, row.id, row.credentialsEncrypted)
        : null,
    rateContext: row.rateContext,
  }));
  const rateVersion = chain.length ? settingsHash("rate", priceInputs) : null;
  const sourceHash = settingsHash("source", {
    projectId: project.id,
    policy,
    defaults: defaults
      ? {
          locationKey: defaults.locationKey,
          country: defaults.country,
          city: defaults.city,
          device: defaults.device,
          frequency: defaults.frequency,
          cronExpression: defaults.cronExpression,
          timezone: defaults.timezone,
          jitterMinutes: defaults.jitterMinutes,
          serpDepth: defaults.serpDepth,
          serpStopOnMatch: defaults.serpStopOnMatch,
        }
      : null,
    schedules: schedules.map(({ createdAt: _created, updatedAt: _updated, ...row }) => row),
    targets,
    priceInputs,
    markets: markets.map((row) => ({
      publicId: row.publicId,
      status: row.status,
      locationId: row.locationId,
    })),
  });
  return {
    project,
    policy,
    defaults,
    schedule: schedule ?? null,
    schedules,
    connectionRows,
    markets,
    chain,
    targets,
    role,
    rateVersion,
    sourceHash,
  };
}
export type SettingsSource = Awaited<ReturnType<typeof loadSettingsSource>>;

/** Strict measurement entry point: absent policy never enables preview/launch. */
export function loadSettingsSource(
  tx: SettingsHostTransaction,
  context: SettingsHostContext,
  projectRef: string,
  scheduleRef: string | null,
) {
  return loadSource(tx, context, projectRef, scheduleRef);
}
/** Non-paid future defaults only. The unknown policy is retained in the signed source, never initialized. */
export async function loadDefaultsIntentSource(
  tx: SettingsHostTransaction,
  context: DefaultsHostContext,
  projectRef: string,
  now = new Date(),
) {
  const authorized = await defaultsProjectScope(tx, context, projectRef, false, now);
  return {
    ...(await loadSource(tx, context, projectRef, null, true, authorized)),
    authority: authorized.authority,
  };
}
