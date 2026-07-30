import type { BacklinkFlag } from "@/lib/providers/types";
import {
  type BacklinksDomainGroup,
  type BacklinksFilter,
  filterDomainGroups,
} from "./backlinks-table-model";

export type BacklinksLinkType =
  | "dofollow"
  | "nofollow"
  | "ugc"
  | "sponsored"
  | "image"
  | "sitewide";
type BacklinksFirstSeen = "any" | "30" | "90";

export type BacklinksFilters = {
  anchorContains: string;
  domainAuthority: [number, number];
  excludeDomain: string;
  firstSeen: BacklinksFirstSeen;
  linkTypes: BacklinksLinkType[];
  spamScore: [number, number];
  targetUrlContains: string;
};

export const emptyBacklinksFilters: BacklinksFilters = {
  anchorContains: "",
  domainAuthority: [0, 100],
  excludeDomain: "",
  firstSeen: "any",
  linkTypes: [],
  spamScore: [0, 10],
  targetUrlContains: "",
};

export const backlinksLinkTypeOptions: readonly {
  flag?: BacklinkFlag;
  id: BacklinksLinkType;
  label: string;
}[] = [
  { id: "dofollow", label: "Dofollow" },
  { flag: "nofollow", id: "nofollow", label: "Nofollow" },
  { flag: "ugc", id: "ugc", label: "UGC" },
  { flag: "sponsored", id: "sponsored", label: "Sponsored" },
  { flag: "image", id: "image", label: "Image links" },
  { flag: "sitewide", id: "sitewide", label: "Sitewide" },
];

const DAY_MS = 86_400_000;

function rowMatchesLinkType(group: BacklinksDomainGroup, type: BacklinksLinkType) {
  if (type === "dofollow") {
    return group.rows.some((row) => !row.flags.includes("nofollow"));
  }
  const option = backlinksLinkTypeOptions.find((item) => item.id === type);
  const flag = option?.flag;
  return Boolean(flag && group.rows.some((row) => row.flags.includes(flag)));
}

function groupWithinDays(group: BacklinksDomainGroup, now: Date, days: number) {
  if (!group.firstSeen) return false;
  const referenceDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const age = referenceDay - new Date(`${group.firstSeen}T00:00:00.000Z`).getTime();
  return age >= 0 && age <= days * DAY_MS;
}

function contains(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function activeBacklinksFilterCount(filters: BacklinksFilters) {
  return [
    filters.linkTypes.length > 0,
    filters.domainAuthority[0] !== 0 || filters.domainAuthority[1] !== 100,
    filters.spamScore[0] !== 0 || filters.spamScore[1] !== 10,
    filters.firstSeen !== "any",
    Boolean(
      filters.anchorContains.trim() ||
        filters.targetUrlContains.trim() ||
        filters.excludeDomain.trim(),
    ),
  ].filter(Boolean).length;
}

export function backlinkLinkTypeCounts(groups: readonly BacklinksDomainGroup[]) {
  return Object.fromEntries(
    backlinksLinkTypeOptions.map((option) => [
      option.id,
      groups.filter((group) => rowMatchesLinkType(group, option.id)).length,
    ]),
  ) as Record<BacklinksLinkType, number>;
}

export function groupMatchesBacklinksFilters(
  group: BacklinksDomainGroup,
  filters: BacklinksFilters,
  now: Date,
) {
  if (
    filters.linkTypes.length > 0 &&
    !filters.linkTypes.some((type) => rowMatchesLinkType(group, type))
  ) {
    return false;
  }
  if (
    group.domainAuthority < filters.domainAuthority[0] ||
    group.domainAuthority > filters.domainAuthority[1] ||
    group.spamScore < filters.spamScore[0] ||
    group.spamScore > filters.spamScore[1]
  ) {
    return false;
  }
  if (filters.firstSeen !== "any" && !groupWithinDays(group, now, Number(filters.firstSeen))) {
    return false;
  }
  if (
    filters.anchorContains.trim() &&
    !group.rows.some((row) => contains(row.anchor, filters.anchorContains))
  ) {
    return false;
  }
  if (
    filters.targetUrlContains.trim() &&
    !group.rows.some((row) => contains(row.targetUrl, filters.targetUrlContains))
  ) {
    return false;
  }
  return !(filters.excludeDomain.trim() && contains(group.sourceDomain, filters.excludeDomain));
}

export function filterBacklinksDomainGroups(
  groups: readonly BacklinksDomainGroup[],
  filters: BacklinksFilters,
  chip: BacklinksFilter,
  now: Date,
) {
  return filterDomainGroups(groups, chip, now).filter((group) =>
    groupMatchesBacklinksFilters(group, filters, now),
  );
}
