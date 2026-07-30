import { appPath } from "@/lib/routing/app-path";
import type { CompetitorMarketOption } from "./types";

export const COMPETITOR_ENGINE = "google" as const;
export type CompetitorDevice = "desktop" | "mobile";

export type CompetitorScope = {
  device: CompetitorDevice;
  engine: typeof COMPETITOR_ENGINE;
  locationId: string;
};

export function competitorMarketKey(scope: CompetitorScope) {
  return `${scope.locationId}::${scope.device}::${scope.engine}`;
}

export function parseCompetitorScope(input: {
  device?: string | null;
  engine?: string | null;
  locationId?: string | null;
}): CompetitorScope | null | undefined {
  const hasAny = Boolean(input.device || input.engine || input.locationId);
  if (!hasAny) return undefined;
  const device = input.device?.toLowerCase();
  const engine = input.engine?.toLowerCase();
  const locationId = input.locationId?.trim();
  if (
    (device !== "desktop" && device !== "mobile") ||
    engine !== COMPETITOR_ENGINE ||
    !locationId
  ) {
    return null;
  }
  return { device, engine, locationId };
}

export function resolveCompetitorMarket(
  markets: CompetitorMarketOption[],
  requested: CompetitorScope | null | undefined,
) {
  if (requested === null) return null;
  if (requested) {
    return markets.find((market) => market.key === competitorMarketKey(requested)) ?? null;
  }
  return markets[0] ?? null;
}

export function competitorScopeHref(
  projectRef: string,
  scope: CompetitorScope,
  viewId?: string | null,
) {
  const params = new URLSearchParams({
    device: scope.device,
    engine: scope.engine,
    location: scope.locationId,
  });
  if (viewId) params.set("view", viewId);
  return `${appPath(projectRef, "competitors")}?${params.toString()}`;
}
