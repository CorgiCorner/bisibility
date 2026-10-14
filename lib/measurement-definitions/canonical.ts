import { createHash } from "node:crypto";
import { trackedProjectDomain } from "@/lib/schemas/project";
import {
  resolveEffectiveSerpDepth,
  resolveSerpStopOnMatch,
  type SerpDepth,
} from "@/lib/serp/constants";
import { DefinitionUnavailableError } from "./errors";
import type { DefinitionHead, DefinitionSource, FrozenWebRequest } from "./model";
import { requestSchema } from "./schema";

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
export function sameDefinitionBytes(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
/** Integrity checksum only; neither revision identity nor an A->B->A compatibility certificate. */
export function definitionFingerprint(source: DefinitionSource): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(source)))
    .digest("hex");
}
export function currentHeadMatches(head: DefinitionHead, source: DefinitionSource): boolean {
  return (
    head.sourceFingerprint === definitionFingerprint(source) &&
    sameDefinitionBytes(head.epochs, source.epochs) &&
    sameDefinitionBytes(head.targetSource, source.target) &&
    sameDefinitionBytes(head.policySource, source.policy)
  );
}
export function targetHeadMatches(head: DefinitionHead, source: DefinitionSource): boolean {
  return (
    head.epochs.projectTarget === source.epochs.projectTarget &&
    head.epochs.keywordTarget === source.epochs.keywordTarget &&
    head.epochs.location === source.epochs.location &&
    sameDefinitionBytes(head.targetSource, source.target)
  );
}
export function frozenRequest(
  source: DefinitionSource,
  providerId: string,
  requestedDepth?: SerpDepth,
): FrozenWebRequest {
  const config = source.policy.config;
  const adapter = config?.adapters.find((entry) => entry.providerId === providerId);
  const domain = trackedProjectDomain(source.target.domain);
  if (!config || !adapter || !domain || source.target.archivedAt)
    throw new DefinitionUnavailableError();
  const stopOnMatch = resolveSerpStopOnMatch(source.policy.defaults?.serpStopOnMatch);
  return requestSchema.parse({
    engine: "google",
    surface: "web_serp",
    resultKind: "organic_result",
    rankScale: "organic_group",
    providerId: adapter.providerId,
    capabilityVersion: adapter.capabilityVersion,
    adapterVersion: adapter.adapterVersion,
    definitionVersion: config.definitionVersion,
    keyword: source.target.text,
    device: source.target.device,
    domain,
    targetUrl: source.target.targetUrl,
    location: source.target.location,
    depth: resolveEffectiveSerpDepth({
      requestedDepth,
      projectDepth: source.policy.defaults?.serpDepth,
      scheduleDepth: source.policy.keywordSchedule?.serpDepth,
      checkScheduleDepth: source.policy.checkSchedule
        ? source.policy.checkSchedule.serpDepth
        : undefined,
    }),
    stopOnMatch,
    findTargetsIn:
      adapter.nativeFindTargetsIn === "with_subdomains_on_match" && stopOnMatch
        ? "with_subdomains"
        : null,
    forcedAiOverview: config.forcedAiOverview,
  });
}

/** Actual current SERP transports use primaryGeoName + hl; display labels are not semantic scope keys. */
export function frozenConfiguredScope(target: DefinitionSource["target"]) {
  return {
    location: target.location.primaryGeoName,
    language: target.location.hl,
    device: target.device,
  };
}
