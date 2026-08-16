import { appPath, appRootPath } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import type { Icon } from "@phosphor-icons/react/lib";
import {
  BellIcon as Bell,
  BinocularsIcon as Binoculars,
  BookOpenTextIcon as BookOpenText,
  CalendarDotsIcon as CalendarDots,
  GearSixIcon as GearSix,
  GlobeIcon as Globe,
  LinkIcon as Link,
  MagnifyingGlassIcon as MagnifyingGlass,
  PuzzlePieceIcon as PuzzlePiece,
  ShieldCheckIcon as ShieldCheck,
  SquaresFourIcon as SquaresFour,
  UsersThreeIcon as UsersThree,
} from "@phosphor-icons/react/ssr";

/**
 * One icon size for every tile in the sidebar rail. The logo mark, the workspace tile and the
 * nav rows used to carry three different values, which is what made the collapsed column read
 * as ragged rather than as a single column of 40px squares.
 */
export const RAIL_ICON_SIZE = 18;

export type NavBadge = "Soon";

export type NavItem = {
  /** Utilities sit apart from primary navigation: history, alerts, settings. */
  group?: "utility";
  label: string;
  href: string;
  icon: Icon;
  badge?: NavBadge;
  external?: boolean;
};

/**
 * Route segments for the primary (non-utility) sidebar entries. The account "default landing
 * page" preference stores one of these, so the preference options stay in lockstep with the
 * rail without a second hand-maintained list.
 */
export const landingSegments = [
  "dashboard",
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

// Keyword research scouts the market (Binoculars); Rank Tracker is the tracked list you then
// search and filter (MagnifyingGlass). The research label says "keyword" because the rail also
// carries Backlinks and Competitors.
// Timeline reads the project's own history, so it belongs with the primary flow; Integrations
// is setup you touch once, which is what utilities are for.
export const primaryNavEntries: readonly PrimaryNavEntry[] = [
  { label: "Dashboard", segment: "dashboard", icon: SquaresFour },
  { label: "Keyword Research", segment: "keyword-research", icon: Binoculars },
  { label: "Domain Overview", segment: "domain-overview", icon: Globe },
  { label: "Rank Tracker", segment: "rank-tracker", icon: MagnifyingGlass },
  { label: "Backlinks", segment: "backlinks", icon: Link },
  { label: "Competitors", segment: "competitors", icon: UsersThree },
  { label: "Timeline", segment: "timeline", icon: CalendarDots },
];

export function navItems(projectRef: string): NavItem[] {
  return [
    ...primaryNavEntries.map((entry) => ({
      label: entry.label,
      href: appPath(projectRef, entry.segment),
      icon: entry.icon,
    })),
    {
      group: "utility",
      label: "Integrations",
      href: appPath(projectRef, "integrations"),
      icon: PuzzlePiece,
    },
    { group: "utility", label: "Alerts", href: appPath(projectRef, "alerts"), icon: Bell },
    { group: "utility", label: "Settings", href: appPath(projectRef, "settings"), icon: GearSix },
  ];
}

export const docsNavItem = {
  label: "Docs & self-hosting",
  href: DOCS_URL,
  icon: BookOpenText,
  external: true,
} satisfies NavItem;

export const instanceAdminNavItem = {
  label: "Instance admin",
  href: appRootPath("admin"),
  icon: ShieldCheck,
} satisfies NavItem;
