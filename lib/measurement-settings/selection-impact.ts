import type {
  FieldSource,
  MeasurementSelection,
  PreviewRequest,
  ScopeEvidence,
  SettingsSnapshot,
} from "./ui-contracts";
export type SettingsImpact = Readonly<{
  kind: "scope_changed" | "policy_changed" | "cadence_only" | "unchanged";
  historicalComparison: "definition_proof_required" | "scope_preserved";
}>;
export function measurementSelectionSources(
  baseline: SettingsSnapshot,
  selection: MeasurementSelection,
): ScopeEvidence["sources"] {
  const inherited =
    baseline.scopeSources ??
    ({
      geo: "project",
      language: "project",
      device: "project",
      surface: "unknown",
      depth: "unknown",
      provider: "unknown",
    } satisfies Record<string, FieldSource>);
  return {
    geo: selection.geoId === baseline.selection.geoId ? inherited.geo : "explicit",
    language:
      selection.languageCode === baseline.selection.languageCode ? inherited.language : "explicit",
    device: selection.device === baseline.selection.device ? inherited.device : "explicit",
    surface: selection.surface === baseline.selection.surface ? inherited.surface : "explicit",
    depth: selection.depth === baseline.selection.depth ? inherited.depth : "explicit",
    provider:
      selection.providerId === baseline.selection.providerId ? inherited.provider : "explicit",
  };
}
/** Presentation of intent changes. This never qualifies old observations or overrides the shared kernel. */
export function measurementSettingsImpact(
  baseline: SettingsSnapshot,
  request: Pick<PreviewRequest, "selection" | "schedule">,
): SettingsImpact {
  const before = baseline.selection,
    after = request.selection;
  const scopeChanged =
    before.geoId !== after.geoId ||
    before.languageCode !== after.languageCode ||
    before.device !== after.device ||
    before.surface !== after.surface;
  const policyChanged =
    before.depth !== after.depth ||
    before.providerId !== after.providerId ||
    before.capabilityVersion !== after.capabilityVersion;
  const kind = scopeChanged
    ? "scope_changed"
    : policyChanged
      ? "policy_changed"
      : JSON.stringify(baseline.schedule) !== JSON.stringify(request.schedule)
        ? "cadence_only"
        : "unchanged";
  return {
    kind,
    historicalComparison:
      scopeChanged || policyChanged ? "definition_proof_required" : "scope_preserved",
  };
}
