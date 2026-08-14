import { LocationKind, type PrismaClient } from "../lib/generated/prisma/client.ts";

const demoMarketDefinitions = [
  {
    canonicalKey: "BE@ar",
    countryCode: "BE",
    displayName: "Belgium",
    gl: "be",
    hl: "ar",
    languageCode: "ar",
    languageLabel: "Arabic",
  },
  {
    canonicalKey: "ES@en",
    countryCode: "ES",
    displayName: "Spain",
    gl: "es",
    hl: "en",
    languageCode: "en",
    languageLabel: "English",
  },
  {
    canonicalKey: "ES",
    countryCode: "ES",
    displayName: "Spain",
    gl: "es",
    hl: "es",
    languageCode: "es",
    languageLabel: "Spanish",
  },
] as const;

export async function seedDemoMarketLocations(prisma: PrismaClient) {
  return Promise.all(
    demoMarketDefinitions.map((market) =>
      prisma.location.upsert({
        where: { canonicalKey: market.canonicalKey },
        update: {},
        create: {
          ...market,
          cityName: null,
          kind: LocationKind.country,
          primaryGeoCode: null,
          primaryGeoName: market.displayName,
          regionCode: null,
          secondaryGeoName: market.displayName,
        },
      }),
    ),
  );
}
