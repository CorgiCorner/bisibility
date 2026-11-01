import type { Prisma } from "@/lib/generated/prisma/client";
import { type CloseoutManifest, historyMigration } from "./manifest";

export type LiveConnectionFacts = {
  connection: { id: string; projectId: string; provider: string; credentialSource: string } | null;
  retainedSettings: { kind: string; source_id: string; payload: unknown }[];
  cutoff: string | null;
};

/**
 * Reads only; the connection row, credentials, status and budgets are never written. Apply first
 * share-locks the connection row (see lockLiveConnection), then reads these facts again.
 */
export async function liveConnectionFacts(
  tx: Prisma.TransactionClient,
  manifest: CloseoutManifest,
): Promise<LiveConnectionFacts> {
  const connection = await tx.providerConnection.findUnique({
    where: { id: manifest.connection },
    select: { id: true, projectId: true, provider: true, credentialSource: true },
  });
  const retainedSettings = await tx.$queryRaw<LiveConnectionFacts["retainedSettings"]>`
    SELECT kind,source_id,payload FROM metering_legacy_setting_source
    WHERE (kind='connection' AND source_id=${manifest.connection}) OR (kind='rate' AND payload->>'connectionId'=${manifest.connection})
    ORDER BY kind,source_id`;
  const [progress] = await tx.$queryRaw<{ cutoff: Date }[]>`
    SELECT snapshot_at AS cutoff FROM metering_history_progress WHERE migration_id=${historyMigration}`;
  return { connection, retainedSettings, cutoff: progress?.cutoff.toISOString() ?? null };
}

/**
 * Apply only: pin the live row through commit, before the connection accounting lock, matching
 * paid admission (row lock, then accounting lock). FOR SHARE, not FOR KEY SHARE: a key share lock
 * would not block a non-key update such as a switch to hosted credentials.
 */
export async function lockLiveConnection(tx: Prisma.TransactionClient, connection: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM provider_connections WHERE id=${connection} FOR SHARE`;
}

// Exactly the columns the original snapshot retained; any other key is unexpected identity.
const connectionKeys = new Set([
  "id",
  "projectId",
  "provider",
  "allocationUnit",
  "allocationAmountPerMonth",
  "programmaticAllocationAmountPerMonth",
  "creditsAllocationAmountPerMonth",
  "creditsProgrammaticAllocationAmountPerMonth",
  "costPerCheckCents",
]);
const rateKeys = new Set(["id", "connectionId", "feature", "amountCents", "provider", "projectId"]);

export function retainedSettingMatchesConnection(
  setting: LiveConnectionFacts["retainedSettings"][number],
  connection: Pick<NonNullable<LiveConnectionFacts["connection"]>, "id" | "projectId" | "provider">,
) {
  const payload = setting.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const values = payload as Record<string, unknown>;
  const keys = setting.kind === "connection" ? connectionKeys : rateKeys;
  if (Object.keys(values).some((key) => !keys.has(key))) return false;
  const optional = (key: "provider" | "projectId") =>
    !(key in values) || values[key] === connection[key];
  if (setting.kind === "connection")
    return (
      setting.source_id === connection.id &&
      values.id === connection.id &&
      values.projectId === connection.projectId &&
      values.provider === connection.provider
    );
  return (
    setting.kind === "rate" &&
    values.connectionId === connection.id &&
    optional("provider") &&
    optional("projectId")
  );
}

/** Replaces only v1's retired-connection rule; every other v1 eligibility rule still applies. */
export function assertLiveConnection(
  live: LiveConnectionFacts | null,
  manifest: CloseoutManifest,
  projectId: string,
) {
  const connection = live?.connection;
  if (!live || !connection)
    throw new Error("The live-connection policy requires the existing connection.");
  if (connection.id !== manifest.connection || connection.projectId !== projectId)
    throw new Error("The live connection must belong to the manifest project.");
  if (connection.credentialSource !== "own")
    throw new Error("Only a live BYOK connection qualifies; hosted connections are refused.");
  if (!live.cutoff || !Number.isFinite(Date.parse(live.cutoff)))
    throw new Error("The original history snapshot cutoff is unavailable.");
  // The retained snapshot of this same connection names only its configured provider and rates.
  // It holds no per-operation provider identity or native units, so it proves nothing to recover.
  for (const setting of live.retainedSettings)
    if (!retainedSettingMatchesConnection(setting, connection))
      throw new Error("Retained settings must describe only this live connection.");
  // Exactly one snapshot row proves the connection existed then; a re-created ID has none.
  if (live.retainedSettings.filter((s) => s.kind === "connection").length !== 1)
    throw new Error("The live connection requires exactly one retained connection snapshot.");
  return { ...live, cutoff: live.cutoff };
}

/** Historical by construction: created before the original snapshot, retained-settings consistent. */
export function assertLiveOperation(
  live: { cutoff: string; retainedSettings: unknown[] },
  createdAt: string,
  retainedIdentity: boolean,
) {
  if (!(Date.parse(createdAt) < Date.parse(live.cutoff)))
    throw new Error("Only operations created before the original history snapshot qualify.");
  if (retainedIdentity !== live.retainedSettings.length > 0)
    throw new Error("Retained connection settings changed during the closeout snapshot.");
}
