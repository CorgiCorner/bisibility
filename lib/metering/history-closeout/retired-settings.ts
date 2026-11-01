import { type LiveConnectionFacts, retainedSettingMatchesConnection } from "./live-connection";
import type { CloseoutManifest } from "./manifest";

/** Retained configuration names no per-operation native identity, result or units. */
export function assertRetiredSettings(
  facts: LiveConnectionFacts | undefined,
  manifest: CloseoutManifest,
  projectId: string,
) {
  if (!manifest.retiredProjectId || manifest.retiredProjectId !== projectId)
    throw new Error("The retained settings must belong to the explicit retired project.");
  if (!facts || facts.connection)
    throw new Error("The retired-settings policy requires the connection to remain absent.");
  if (!facts.cutoff || !Number.isFinite(Date.parse(facts.cutoff)))
    throw new Error("The original history snapshot cutoff is unavailable.");
  const connections = facts.retainedSettings.filter((s) => s.kind === "connection");
  const [setting] = connections;
  if (connections.length !== 1 || !setting)
    throw new Error("Exactly one retained connection snapshot is required.");
  const payload = setting.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("The retained connection configuration is unavailable.");
  const provider = (payload as Record<string, unknown>).provider;
  if (typeof provider !== "string" || !provider)
    throw new Error("The original configured provider is unavailable.");
  const connection = { id: manifest.connection, projectId, provider };
  for (const setting of facts.retainedSettings)
    if (!retainedSettingMatchesConnection(setting, connection))
      throw new Error("Retained settings must describe only the original retired connection.");
  return { ...facts, cutoff: facts.cutoff };
}
