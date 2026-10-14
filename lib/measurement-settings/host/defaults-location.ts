import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { LocationDescription, LocationStore } from "@/lib/serp/location";
import { countrySeed } from "@/lib/serp/location";
import { resolveKeywordLocationUsingStore } from "@/lib/serp/location-service";
import { locationCandidateUpdate } from "@/lib/serp/location-store";
import type { ProjectDefaultMarketInput } from "@/lib/serp/project-default-market";

/** The same canonical catalog resolver, with no create/enrich database writes or synthetic IDs. */
export async function describeDefaultMarket(
  tx: Prisma.TransactionClient,
  input: ProjectDefaultMarketInput,
) {
  const store: LocationStore<LocationDescription> = {
    findByKey: (canonicalKey) =>
      tx.location.findUnique({
        where: { canonicalKey },
        select: {
          canonicalKey: true,
          kind: true,
          displayName: true,
          countryCode: true,
          regionCode: true,
          cityName: true,
          gl: true,
          hl: true,
          languageCode: true,
          languageLabel: true,
          primaryGeoCode: true,
          primaryGeoName: true,
          secondaryGeoName: true,
        },
      }),
    create: async (row) => row,
    enrich: async (row, candidate) => ({ ...row, ...locationCandidateUpdate(row, candidate) }),
  };
  const resolved = await resolveKeywordLocationUsingStore(
    input.selection
      ? { projectId: input.projectId, selection: input.selection }
      : input.locationKey
        ? {
            projectId: input.projectId,
            selection: { canonicalKey: input.locationKey, kind: "city" },
          }
        : { projectId: input.projectId, country: input.country, city: input.city },
    store,
  );
  if (resolved.degraded) throw new Error(resolved.warning ?? "Choose a verified location.");
  const location = resolved.location;
  return {
    location,
    market: {
      city: location.kind === "city" ? location.displayName : null,
      country: countrySeed(location.countryCode)?.displayName ?? input.country,
      device: input.device,
      locationKey: location.canonicalKey,
      displayName: location.displayName,
    },
  };
}
