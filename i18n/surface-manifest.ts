import uiSurfaceRegistry from "./ui-surface-registry.json" with { type: "json" };

const migratedSources = uiSurfaceRegistry.sources
  .filter((source) => source.status === "migrated" || source.status === "excluded")
  .map((source) => source.path);
const pendingSources = uiSurfaceRegistry.sources
  .filter((source) => source.status === "pending")
  .map((source) => source.path);

export const i18nSurfaceManifest = {
  auditedAt: "2026-09-12",
  foundationSources: migratedSources,
  initialMarketing: ["home", "integrations", "pricing", "faq", "cost-calculator"] as const,
  registry: {
    completedSourceCount: migratedSources.length,
    path: "i18n/ui-surface-registry.json",
    pendingSourceCount: pendingSources.length,
    schemaVersion: uiSurfaceRegistry.schemaVersion,
  },
  scope: uiSurfaceRegistry.scope,
} as const;

// This is an incremental inventory. Pending sources remain incomplete until the
// strict UI i18n completion command verifies every registered source.
