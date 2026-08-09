import "server-only";

import { requireApiPublicId } from "@/lib/api/public-id";
import {
  connectionResources,
  eligibleResearchConnections,
  keywordResearchPageProject,
} from "@/lib/keyword-research/context";
import { keywordResearchDefaultMarket } from "@/lib/keyword-research/default-market";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { countrySeed } from "@/lib/serp/location";
import { requireReadableProject } from "./_auth";

export async function getKeywordResearchPageContext(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  const researchProject = await keywordResearchPageProject(project.id);
  if (!researchProject) {
    throw new Error("Project not found.");
  }

  const { locationRef: persistedLocation, market } =
    await keywordResearchDefaultMarket(researchProject);
  const language = countrySeed(market.locationKey.split("/")[0] ?? "");
  const eligible = eligibleResearchConnections(researchProject, "research");

  return {
    connections: connectionResources(eligible).map((connection) => ({
      ...connection,
      id: requireApiPublicId(connection.id, "conn") as string,
    })),
    defaultMarket: market,
    language: {
      code: language?.hl ?? "en",
      label: language?.languageLabel ?? "English",
    },
    location: persistedLocation
      ? {
          canonicalKey: persistedLocation.canonicalKey,
          cityName: persistedLocation.cityName,
          countryCode: persistedLocation.countryCode,
          displayName: persistedLocation.displayName,
          hl: persistedLocation.hl,
          kind: persistedLocation.kind,
          languageLabel: persistedLocation.languageLabel,
          regionName: null,
        }
      : {
          canonicalKey: market.locationKey,
          cityName: market.city,
          countryCode: language?.countryCode ?? "US",
          displayName: market.displayName,
          hl: language?.hl ?? "en",
          kind: market.city ? ("city" as const) : ("country" as const),
          languageLabel: language?.languageLabel ?? "English",
          regionName: null,
        },
    project: {
      domain: trackedProjectDomain(project.domain) ?? "",
      id: project.publicId,
      name: project.name,
    },
  };
}
