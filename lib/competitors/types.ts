import { normalizeDomain } from "@/lib/domains/normalize";
import { z } from "zod";

const domainPattern =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const normalizeCompetitorDomain = normalizeDomain;

const domainSchema = z
  .string()
  .trim()
  .min(1, "Add a domain.")
  .transform((value, context) => {
    const domain = normalizeCompetitorDomain(value);
    if (!domain || !domainPattern.test(domain)) {
      context.addIssue({ code: "custom", message: "Use a valid bare domain." });
      return z.NEVER;
    }
    return domain;
  });

const labelSchema = z
  .string()
  .trim()
  .max(80, "Keep the label under 80 characters.")
  .optional()
  .transform((value) => value || undefined);

export const addManagedCompetitorSchema = z.object({
  domain: domainSchema,
  label: labelSchema,
  projectId: z.string().trim().min(1),
});

export const renameManagedCompetitorSchema = z.object({
  competitorId: z.string().trim().min(1),
  label: z.string().trim().min(1, "Add a label.").max(80, "Keep the label under 80 characters."),
  projectId: z.string().trim().min(1),
});

export const removeManagedCompetitorSchema = z.object({
  competitorId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
});

export type AddManagedCompetitorInput = z.input<typeof addManagedCompetitorSchema>;
export type RenameManagedCompetitorInput = z.input<typeof renameManagedCompetitorSchema>;

export type CompetitorKind = "You" | "Managed";

export type ManagedCompetitor = {
  domain: string;
  id: string;
  initials: string;
  label: string;
};

export type CompetitorColumn = {
  domain: string;
  id?: string;
  kind: CompetitorKind;
  label: string;
};

export type CompetitorShare = {
  color: string;
  domain: string;
  id?: string;
  initials: string;
  kind: CompetitorKind;
  label: string;
  shareOfVoice: number;
  sharedKeywords: number;
};

export type HeadToHeadRow = {
  gap: number | null;
  id: string;
  keyword: string;
  ranks: Record<string, number | null>;
};

export type CompetitorPositionBucket = "all" | "top3" | "top10";

export type CompetitorFilter = {
  excludedKeywordIds: string[];
  position: CompetitorPositionBucket;
  tag: string | null;
};

export type CompetitorObservation = {
  completed: boolean;
  id: string;
  keyword: string;
  ranked: boolean;
  ranks: Record<string, number | null>;
  tags: string[];
  volume: number | null;
};

export type CompetitorMarketDataState =
  | "no_completed_checks"
  | "completed_unranked"
  | "filter_excludes_all"
  | "no_volume_data"
  | "ranked";

// Raw, filter-independent market data. The client recomputes shares and head-to-head
// rows from these observations for any active position-bucket + tag filter.
export type CompetitorMarketData = {
  allColumns: CompetitorColumn[];
  competitorCount: number;
  device: "desktop" | "mobile";
  engine: "google";
  key: string;
  languageLabel: string;
  location: string;
  locationId: string;
  locationKind: "country" | "region" | "city";
  observations: CompetitorObservation[];
  tags: string[];
  trackedKeywordCount: number;
};

export type CompetitorMarketOption = {
  canonicalKey: string;
  checkedKeywordCount: number;
  cityName: string | null;
  countryCode: string;
  device: "desktop" | "mobile";
  engine: "google";
  key: string;
  keywordCount: number;
  languageLabel: string;
  location: string;
  locationId: string;
  locationKind: "country" | "region" | "city";
  regionName: string | null;
  hl: string;
};

export type CompetitorMarket = CompetitorMarketData & {
  checkedKeywordCount: number;
  columns: CompetitorColumn[];
  dataState: CompetitorMarketDataState;
  hasRankData: boolean;
  rows: HeadToHeadRow[];
  shares: CompetitorShare[];
  sharedKeywordCount: number;
};

export type SuggestedCompetitor = {
  domain: string;
  initials: string;
  overlap: number;
};

export type CompetitorsViewModel = {
  managedCompetitors: ManagedCompetitor[];
  market: CompetitorMarket | null;
  markets: CompetitorMarketOption[];
  projectId: string;
  scope: {
    device: "desktop" | "mobile";
    engine: "google";
    locationId: string;
  } | null;
  suggestions: SuggestedCompetitor[];
};
