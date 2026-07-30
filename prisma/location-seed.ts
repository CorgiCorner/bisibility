import { LocationKind, type PrismaClient } from "../lib/generated/prisma/client.ts";

let usLocationIdCache: string | null = null;

export async function usLocationId(prisma: PrismaClient) {
  if (usLocationIdCache) return usLocationIdCache;
  const location = await prisma.location.upsert({
    where: { canonicalKey: "US" },
    update: {},
    create: {
      canonicalKey: "US",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      kind: LocationKind.country,
      languageLabel: "English",
      primaryGeoCode: null,
      primaryGeoName: "United States",
      regionCode: null,
      secondaryGeoName: "United States",
    },
  });
  usLocationIdCache = location.id;
  return location.id;
}
