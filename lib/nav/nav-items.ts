import { appPath, appRootPath } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import type { Icon } from "@phosphor-icons/react/lib";
import {
  BellIcon as Bell,
  BinocularsIcon as Binoculars,
  BookOpenTextIcon as BookOpenText,
  ClockCounterClockwiseIcon as ClockCounterClockwise,
  GearSixIcon as GearSix,
  LinkIcon as Link,
  MagnifyingGlassIcon as MagnifyingGlass,
  PulseIcon as Pulse,
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

export function navItems(projectRef: string): NavItem[] {
  return [
    { label: "Overview", href: appPath(projectRef, "overview"), icon: SquaresFour },
    // Keyword research scouts the market (Binoculars); Rank Tracker is the tracked list you then
    // search and filter (MagnifyingGlass); Checks is a recurring heartbeat, not a calendar (Pulse).
    // The research label says "keyword" because the rail also carries Backlinks and Competitors.
    { label: "Keyword Research", href: appPath(projectRef, "research"), icon: Binoculars },
    { label: "Rank Tracker", href: appPath(projectRef, "rank-tracker"), icon: MagnifyingGlass },
    { label: "Backlinks", href: appPath(projectRef, "backlinks"), icon: Link },
    { label: "Checks", href: appPath(projectRef, "checks"), icon: Pulse },
    { label: "Competitors", href: appPath(projectRef, "competitors"), icon: UsersThree },
    // Timeline reads the project's own history, so it belongs with the primary flow; Integrations
    // is setup you touch once, which is what utilities are for.
    { label: "Timeline", href: appPath(projectRef, "timeline"), icon: ClockCounterClockwise },
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
