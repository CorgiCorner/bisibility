import { isProjectReadOnly, normalizeProjectWriteMode } from "@/lib/deployment/project-write-mode";
import type { ProviderKind } from "@/lib/providers/types";

/**
 * Closed reason enum for project readiness. The same codes are appended to
 * *_not_connected API error messages so clients branch on one vocabulary.
 */
export const READINESS_REASONS = [
  "provider_not_connected",
  "provider_disabled",
  "needs_reauth",
  "project_read_only",
  "token_read_only",
] as const;

export type ReadinessReason = (typeof READINESS_REASONS)[number];

/** Stable reason codes for reuse in API error messages. */
export const READINESS_REASON = {
  needsReauth: "needs_reauth",
  providerDisabled: "provider_disabled",
  providerNotConnected: "provider_not_connected",
  projectReadOnly: "project_read_only",
  tokenReadOnly: "token_read_only",
} as const satisfies Record<string, ReadinessReason>;

export type ReadinessTokenScope = "read" | "write";

/** What a provider implementation can serve, independent of connection state. */
export type ProviderAreaCapabilities = {
  backlinks: boolean;
  domainOverview: boolean;
  keywordMetrics: boolean;
  keywordResearch: boolean;
  rankChecks: boolean;
  searchPerformance: boolean;
};

export type ReadinessConnection = ProviderAreaCapabilities & {
  enabled: boolean;
  kind: ProviderKind;
  priority: number;
  provider: string;
  status: string;
};

export type ReadinessArea = {
  available: boolean;
  reason: ReadinessReason | null;
};

export type ProjectReadiness = {
  backlinks: ReadinessArea;
  domain_overview: ReadinessArea;
  keyword_research: ReadinessArea;
  search_performance: ReadinessArea;
  serp: ReadinessArea & { primary_provider: string | null };
  token_scope: ReadinessTokenScope;
  write_mode: string;
};

const READINESS_AREA_REQUIREMENTS = {
  backlinks: { capability: "backlinks", kind: "serp" },
  domain_overview: { capability: "domainOverview", kind: "serp" },
  keyword_research: { capability: "keywordResearch", kind: "serp" },
  search_performance: { capability: "searchPerformance", kind: "analytics" },
  serp: { capability: "rankChecks", kind: "serp" },
} as const satisfies Record<
  string,
  { capability: keyof ProviderAreaCapabilities; kind: ProviderKind }
>;

type AreaRequirement =
  (typeof READINESS_AREA_REQUIREMENTS)[keyof typeof READINESS_AREA_REQUIREMENTS];

type ConnectionGate = {
  available: boolean;
  primaryProvider: string | null;
  reason: ReadinessReason | null;
};

function unavailable(reason: ReadinessReason): ConnectionGate {
  return { available: false, primaryProvider: null, reason };
}

function connectionAreaGate(
  connections: readonly ReadinessConnection[],
  area: AreaRequirement,
): ConnectionGate {
  const capable = connections.filter(
    (connection) => connection.kind === area.kind && connection[area.capability],
  );
  if (capable.length === 0) return unavailable(READINESS_REASON.providerNotConnected);
  if (!capable.some((connection) => connection.enabled)) {
    return unavailable(READINESS_REASON.providerDisabled);
  }
  const usable = capable
    .filter((connection) => connection.enabled && connection.status === "connected")
    .sort(
      (left, right) =>
        left.priority - right.priority || left.provider.localeCompare(right.provider),
    );
  if (usable.length === 0) return unavailable(READINESS_REASON.needsReauth);
  return { available: true, primaryProvider: usable[0].provider, reason: null };
}

function readinessArea(connections: readonly ReadinessConnection[], area: AreaRequirement) {
  const gate = connectionAreaGate(connections, area);
  return { available: gate.available, reason: gate.reason };
}

function serpReadinessArea(
  connections: readonly ReadinessConnection[],
  input: { tokenScope: ReadinessTokenScope; writeMode: string },
) {
  const gate = connectionAreaGate(connections, READINESS_AREA_REQUIREMENTS.serp);
  if (!gate.available) {
    return { available: false, primary_provider: null, reason: gate.reason };
  }
  if (isProjectReadOnly(input.writeMode)) {
    return {
      available: false,
      primary_provider: gate.primaryProvider,
      reason: READINESS_REASON.projectReadOnly,
    };
  }
  if (input.tokenScope === "read") {
    return {
      available: false,
      primary_provider: gate.primaryProvider,
      reason: READINESS_REASON.tokenReadOnly,
    };
  }
  return { available: true, primary_provider: gate.primaryProvider, reason: null };
}

/**
 * Pure readiness computation over pre-mapped connection rows. Callers derive
 * per-provider capabilities with providerAreaCapabilities in lib/api/provider-list.
 */
export function computeProjectReadiness(input: {
  connections: readonly ReadinessConnection[];
  tokenScope: ReadinessTokenScope;
  writeMode: string;
}): ProjectReadiness {
  const { connections, tokenScope } = input;
  const writeMode = normalizeProjectWriteMode(input.writeMode);
  return {
    backlinks: readinessArea(connections, READINESS_AREA_REQUIREMENTS.backlinks),
    domain_overview: readinessArea(connections, READINESS_AREA_REQUIREMENTS.domain_overview),
    keyword_research: readinessArea(connections, READINESS_AREA_REQUIREMENTS.keyword_research),
    search_performance: readinessArea(connections, READINESS_AREA_REQUIREMENTS.search_performance),
    serp: serpReadinessArea(connections, { tokenScope, writeMode }),
    token_scope: tokenScope,
    write_mode: writeMode,
  };
}
