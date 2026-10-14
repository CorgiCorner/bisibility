import { RANK_REPORT_CALENDAR_CONFIGURATION } from "@/lib/rank-reports/host-policy";
import { frozenRequest, sameDefinitionBytes } from "./canonical";
import { DefinitionUnavailableError } from "./errors";
import { hostDefinitionAdapter } from "./host-adapters";
import type {
  DefinitionSource,
  DefinitionTransaction,
  FrozenWebRequest,
  PersistedDefinitionPolicy,
} from "./model";

export function hostDefinitionConfigImplemented(config: PersistedDefinitionPolicy) {
  return (
    config.definitionVersion === "web-organic-v1" &&
    config.forcedAiOverview === false &&
    config.freshness.configurationRevision === RANK_REPORT_CALENDAR_CONFIGURATION &&
    config.adapters.every((entry) =>
      sameDefinitionBytes(entry, hostDefinitionAdapter(entry.providerId)?.policy),
    )
  );
}
export function assertHostDefinitionRequest(
  config: PersistedDefinitionPolicy,
  request: FrozenWebRequest,
) {
  const entry = hostDefinitionAdapter(request.providerId);
  const configured = config.adapters.find((row) => row.providerId === request.providerId);
  const capability = entry?.capability;
  if (
    !entry ||
    !capability ||
    !sameDefinitionBytes(configured, entry.policy) ||
    config.definitionVersion !== request.definitionVersion ||
    request.engine !== capability.engine ||
    request.surface !== capability.surface ||
    request.rankScale !== capability.rankScale ||
    !capability.resultKinds.includes(request.resultKind) ||
    !capability.devices.includes(request.device) ||
    !capability.locationKinds.includes(request.location.kind) ||
    !capability.depths.includes(request.depth) ||
    request.depth > capability.maxDepth ||
    request.capabilityVersion !== entry.policy.capabilityVersion ||
    request.adapterVersion !== entry.policy.adapterVersion ||
    request.forcedAiOverview !== false ||
    request.findTargetsIn !==
      (entry.policy.nativeFindTargetsIn === "with_subdomains_on_match" && request.stopOnMatch
        ? "with_subdomains"
        : null)
  ) {
    throw new DefinitionUnavailableError();
  }
}
/** The optional request preserves callers of the old port; capture/dispatch now pass the exact request. */
export async function assertHostDefinitionAdapter(
  _tx: DefinitionTransaction,
  source: DefinitionSource,
  providerId: string,
  original?: FrozenWebRequest,
): Promise<void> {
  const request = original ?? frozenRequest(source, providerId);
  if (
    !source.policy.config ||
    providerId !== request.providerId ||
    !hostDefinitionConfigImplemented(source.policy.config) ||
    !sameDefinitionBytes(request, frozenRequest(source, providerId, request.depth))
  )
    throw new DefinitionUnavailableError();
  assertHostDefinitionRequest(source.policy.config, request);
}
