import { appPath, appRootPath, SEARCH_CONSOLE_SEGMENT } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import type { Icon } from "@phosphor-icons/react/lib";
import {
  BinocularsIcon as Binoculars,
  BookOpenTextIcon as BookOpenText,
  ClockCounterClockwiseIcon as ClockCounterClockwise,
  GearSixIcon as GearSix,
  GlobeIcon as Globe,
  GoogleLogoIcon as GoogleLogo,
  LinkIcon as Link,
  PuzzlePieceIcon as PuzzlePiece,
  RankingIcon as Ranking,
  ShieldCheckIcon as ShieldCheck,
  SirenIcon as Siren,
  SquaresFourIcon as SquaresFour,
  TerminalWindowIcon as TerminalWindow,
  UsersThreeIcon as UsersThree,
} from "@phosphor-icons/react/ssr";

/**
 * One icon size for every tile in the sidebar rail. The logo mark, the workspace tile and the
 * nav rows used to carry three different values, which is what made the collapsed column read
 * as ragged rather than as a single column of 40px squares.
 */
export const RAIL_ICON_SIZE = 18;

export type NavBadge = "new" | "alpha" | "experimental";

export type NavItemGroup = "top" | "track" | "research" | "connect" | "utility";

export type NavItem = {
  /** The rail consumes this grouping while command-palette navigation stays flat. */
  group: NavItemGroup;
  label: string;
  href: string;
  icon: Icon;
  badge?: NavBadge;
  external?: boolean;
};

/**
 * Route segments eligible for the account "default landing page" preference. This stays
 * narrower than the rail: Connect and utility surfaces are navigable but are not landing pages.
 */
export const landingSegments = [
  "dashboard",
  SEARCH_CONSOLE_SEGMENT,
  "keyword-research",
  "domain-overview",
  "rank-tracker",
  "backlinks",
  "competitors",
  "timeline",
] as const;

export type LandingSegment = (typeof landingSegments)[number];

type PrimaryNavEntry = {
  label: string;
  segment: LandingSegment;
  icon: Icon;
};

export const navItemGroups = [
  { id: "track", label: "Track" },
  { id: "research", label: "Research" },
  { id: "connect", label: "Connect" },
] as const satisfies readonly {
  id: Exclude<NavItemGroup, "top" | "utility">;
  label: string;
}[];

type NavEntry = Omit<NavItem, "href"> & { segment: string };

// Keyword research scouts the market (Binoculars); Rank Tracker is the podium of tracked
// positions (Ranking). Fill marks the current row, Regular the rest - same as every rail glyph.
// The order is the rail order. `landingSegments` deliberately preserves the independent
// preference order below rather than treating every reachable rail item as a landing page.
const railNavEntries = [
  { group: "top", label: "Dashboard", segment: "dashboard", icon: SquaresFour },
  {
    group: "top",
    label: "Search Console",
    segment: SEARCH_CONSOLE_SEGMENT,
    icon: GoogleLogo,
    badge: "alpha",
  },
  { group: "track", label: "Rank Tracker", segment: "rank-tracker", icon: Ranking },
  {
    group: "track",
    label: "Competitors",
    segment: "competitors",
    icon: UsersThree,
    badge: "alpha",
  },
  {
    group: "track",
    label: "Timeline",
    segment: "timeline",
    icon: ClockCounterClockwise,
    badge: "experimental",
  },
  {
    group: "research",
    label: "Keyword Research",
    segment: "keyword-research",
    icon: Binoculars,
  },
  { group: "research", label: "Domain Overview", segment: "domain-overview", icon: Globe },
  { group: "research", label: "Backlinks", segment: "backlinks", icon: Link },
  { group: "connect", label: "Integrations", segment: "integrations", icon: PuzzlePiece },
  { group: "connect", label: "Install", segment: "install", icon: TerminalWindow },
  { group: "utility", label: "Alerts", segment: "alerts", icon: Siren, badge: "alpha" },
  { group: "utility", label: "Settings", segment: "settings", icon: GearSix },
] as const satisfies readonly NavEntry[];

export const primaryNavEntries: readonly PrimaryNavEntry[] = landingSegments.map((segment) => {
  const entry = railNavEntries.find((item) => item.segment === segment);
  if (!entry) {
    throw new Error(`Missing landing navigation entry for ${segment}`);
  }

  return { label: entry.label, segment, icon: entry.icon };
});

export function navItems(projectRef: string): NavItem[] {
  return railNavEntries.map(({ segment, ...item }) => ({
    ...item,
    href: appPath(projectRef, segment),
  }));
}

export const docsNavItem = {
  group: "top",
  label: "Docs and self-hosting",
  href: DOCS_URL,
  icon: BookOpenText,
  external: true,
} satisfies NavItem;

export const instanceAdminNavItem = {
  group: "top",
  label: "Instance admin",
  href: appRootPath("admin"),
  icon: ShieldCheck,
} satisfies NavItem;
