import { SEARCH_CONSOLE_SEGMENT } from "@/lib/routing/app-path";
import { BinocularsIcon as Binoculars } from "@phosphor-icons/react/dist/ssr/Binoculars";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { FilesIcon as Files } from "@phosphor-icons/react/dist/ssr/Files";
import { GlobeIcon as Globe } from "@phosphor-icons/react/dist/ssr/Globe";
import { LinkIcon as Link } from "@phosphor-icons/react/dist/ssr/Link";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/dist/ssr/NotePencil";
import { RankingIcon as Ranking } from "@phosphor-icons/react/dist/ssr/Ranking";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import type { Icon } from "@phosphor-icons/react/lib";

/**
 * Route segments eligible for the account "default landing page" preference. This stays
 * narrower than the rail: project configuration surfaces are navigable but are not landing pages.
 */
export const landingSegments = [
  "dashboard",
  "pages",
  SEARCH_CONSOLE_SEGMENT,
  "keyword-research",
  "domain-overview",
  "rank-tracker",
  "backlinks",
  "competitors",
  "ai-visibility",
  "annotations",
] as const;

export type LandingSegment = (typeof landingSegments)[number];

type PrimaryNavEntry = {
  label: string;
  segment: LandingSegment;
  icon: Icon;
};

export const landingNavEntries = {
  dashboard: { icon: SquaresFour, label: "Dashboard" },
  pages: { icon: Files, label: "Pages" },
  "search-console": { icon: ChartLineUp, label: "Search Console" },
  "keyword-research": { icon: Binoculars, label: "Keyword Research" },
  "domain-overview": { icon: Globe, label: "Domain Overview" },
  "rank-tracker": { icon: Ranking, label: "Rank Tracker" },
  backlinks: { icon: Link, label: "Backlinks" },
  competitors: { icon: UsersThree, label: "Competitors" },
  "ai-visibility": { icon: Sparkle, label: "AI Visibility" },
  annotations: { icon: NotePencil, label: "Annotations" },
} as const satisfies Record<LandingSegment, Omit<PrimaryNavEntry, "segment">>;

export type { PrimaryNavEntry };
