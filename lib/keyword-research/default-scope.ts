import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  type ResearchScope,
  researchScopeForLocation,
  researchScopeForLocationKey,
} from "@/lib/research/scope";
import { DEFAULT_SERP_DEVICE, serpDeviceValues } from "@/lib/serp/constants";
import { countryCodeForMarketName, countrySeed } from "@/lib/serp/location";
import type { KeywordResearchPageProject } from "./context";

const LOCATION_GROUP_LIMIT = 16;

const locationSelect = {
  canonicalKey: true,
  countryCode: true,
  displayName: true,
  hl: true,
  id: true,
  languageLabel: true,
} as const;

type KeywordResearchDefault = {
  device: (typeof serpDeviceValues)[number];
  locationKey: string;
  scope: ResearchScope;
};

type DefaultCandidate = KeywordResearchDefault & {
  count: number;
  displayName: string;
};

function scopeLocationKey(scope: Pick<ResearchScope, "countryCode" | "languageCode">) {
  return countrySeed(scope.countryCode)?.hl === scope.languageCode
    ? scope.countryCode
    : `${scope.countryCode}@${scope.languageCode}`;
}

function configuredDefault(project: KeywordResearchPageProject): KeywordResearchDefault | null {
  const defaults = project.defaults;
  if (!defaults?.country || !defaults.device) return null;
  const locationKey = defaults.locationKey ?? countryCodeForMarketName(defaults.country) ?? "US";
  return {
    device: defaults.device,
    locationKey,
    scope: researchScopeForLocationKey(locationKey),
  };
}

function fallbackDefault(): KeywordResearchDefault {
  return {
    device: DEFAULT_SERP_DEVICE,
    locationKey: "US",
    scope: researchScopeForLocationKey("US"),
  };
}

function candidateRank(candidate: DefaultCandidate) {
  if (candidate.scope.countryCode !== "US") return 2;
  return candidate.device === DEFAULT_SERP_DEVICE ? 0 : 1;
}

function compareCandidates(left: DefaultCandidate, right: DefaultCandidate) {
  return (
    right.count - left.count ||
    candidateRank(left) - candidateRank(right) ||
    left.displayName.localeCompare(right.displayName) ||
    serpDeviceValues.indexOf(left.device) - serpDeviceValues.indexOf(right.device)
  );
}

export async function keywordResearchDefault(
  project: KeywordResearchPageProject,
): Promise<KeywordResearchDefault> {
  const explicit = configuredDefault(project);
  if (explicit) return explicit;

  const fallback = fallbackDefault();
  const groups = await prisma.keyword.groupBy({
    _count: { _all: true },
    by: ["locationId", "device"],
    orderBy: [{ _count: { id: "desc" } }, { locationId: "asc" }, { device: "asc" }],
    take: LOCATION_GROUP_LIMIT,
    where: { projectId: project.id },
  });
  if (groups.length === 0) return fallback;

  const locations = await prisma.location.findMany({
    select: locationSelect,
    where: { id: { in: groups.map((group) => group.locationId) } },
  });
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const candidates = groups.flatMap((group) => {
    const location = locationsById.get(group.locationId);
    if (!location) return [];
    const scope = researchScopeForLocation({
      countryCode: location.countryCode,
      languageCode: location.hl,
      languageLabel: location.languageLabel,
    });
    return [
      {
        count: group._count._all,
        device: group.device,
        displayName: location.displayName,
        locationKey: location.canonicalKey ?? scopeLocationKey(scope),
        scope,
      },
    ];
  });
  return candidates.sort(compareCandidates)[0] ?? fallback;
}

export async function keywordResearchDefaultScope(project: KeywordResearchPageProject) {
  return (await keywordResearchDefault(project)).scope;
}
