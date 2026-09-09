import { prisma } from "@/lib/db/prisma";
import { untrackedMarketMessage } from "@/lib/markets/archived";
import { DEFAULT_SERP_DEVICE } from "@/lib/serp/constants";
import { serpCountryByCode } from "@/lib/serp/country-catalog";
import { normalizeCanonicalLocationKey, parseCanonicalKey } from "@/lib/serp/location";

/** Only an explicitly selected, visible project market can fill missing CSV geography. */
export async function keywordImportDefaults(projectId: string, defaultMarketKey?: string | null) {
  const project = await prisma.project.findUnique({
    select: { defaults: true },
    where: { id: projectId },
  });
  const device = project?.defaults?.device ?? DEFAULT_SERP_DEVICE;
  if (!defaultMarketKey) return { city: null, country: "", device, locationKey: "" };
  const key = normalizeCanonicalLocationKey(defaultMarketKey).canonicalKey;
  const markets = await prisma.projectMarket.findMany({
    select: { location: { select: { canonicalKey: true } } },
    where: { projectId, status: { in: ["active", "paused"] } },
  });
  if (!markets.some((market) => market.location.canonicalKey === key))
    throw new Error(untrackedMarketMessage(key));
  const location = parseCanonicalKey(key);
  return {
    city: location?.cityName ?? null,
    country: serpCountryByCode(location?.countryCode ?? "")?.displayName ?? "",
    device,
    locationKey: key,
  };
}
