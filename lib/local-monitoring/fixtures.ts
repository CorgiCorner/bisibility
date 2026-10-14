import type { LocalCapability } from "./capability";
import { canonicalCoordinate } from "./coordinates";
import { createGridRevision } from "./geometry";
import { freezeGridSelection } from "./grid-selection";
import type { LocalQuote } from "./quote";
import type { ExecutionTargetV1 } from "./types";

export const localFixtureNow = new Date("2026-10-12T12:00:00.000Z");
export function localGridFixture(size: 1 | 3 | 5 | 7 = 5, revisionId = "synthetic-grid-v1") {
  return createGridRevision({
    revisionId,
    center: canonicalCoordinate("52.2297", "21.0122"),
    size,
    spacingMetres: 100,
  });
}
export function localTargetFixture(
  pointRevision: string,
  overrides: Partial<ExecutionTargetV1> = {},
): ExecutionTargetV1 {
  return {
    version: 1,
    projectId: "synthetic-project",
    keywordId: "synthetic-keyword",
    keywordRevision: "keyword-revision-1",
    pointRevision,
    engine: "google",
    surface: "maps",
    resultKind: "map_listing",
    rankScale: "maps_organic",
    language: "en",
    device: "desktop",
    operatingSystem: null,
    cutoff: 20,
    zoom: 14,
    policyRevision: "local-policy-v1",
    ...overrides,
  };
}
export function localSelectionFixture(size: 1 | 3 | 5 | 7 = 5) {
  const grid = localGridFixture(size);
  const targets = grid.points.map(({ point }) => localTargetFixture(point.revisionKey));
  return { grid, selection: freezeGridSelection(grid, targets), targets };
}

/** Synthetic test evidence only; never enters the application's capability catalog. */
export const localCapabilityFixture: LocalCapability = {
  version: "synthetic-capability-v1",
  provider: "dataforseo",
  adapterVersion: "synthetic-local-adapter-v1",
  expiresAt: "2026-10-13T12:00:00.000Z",
  nativeBillingUnit: "cents",
  implementations: [
    {
      evidenceVersion: "synthetic-not-production",
      engine: "google",
      surface: "maps",
      resultKind: "map_listing",
      rankScale: "maps_organic",
      point: true,
      devices: ["desktop"],
      operatingSystems: [null],
      languages: ["en"],
      maxCutoff: 20,
      zoomRange: [0, 20],
      asyncSubmitCollect: true,
    },
  ],
};
export function localQuoteFixture(targetKeys: readonly string[]): LocalQuote {
  return {
    version: 1,
    projectId: "synthetic-project",
    expectedTargetKeys: [...targetKeys],
    effectiveOptions: { depth: "20", zoom: "14" },
    capabilityVersion: localCapabilityFixture.version,
    provider: localCapabilityFixture.provider,
    adapterVersion: localCapabilityFixture.adapterVersion,
    providerPriceVersion: "synthetic-price-v1",
    nativeEstimates: [{ unit: "cents", amount: null }],
    issuedAt: "2026-10-12T11:00:00.000Z",
    expiresAt: "2026-10-12T13:00:00.000Z",
  };
}
