import { hasMarketRoute, sectionPathOf } from "@/lib/markets/market-route-sections";
import {
  appPath,
  appPathContext,
  appRootPath,
  MARKET_SEGMENT,
  SEARCH_CONSOLE_SEGMENT,
} from "@/lib/routing/app-path";
import {
  type ExperimentalModuleKey,
  hasExperimentalModule,
} from "@/lib/settings/experimental-modules";
import { DOCS_URL } from "@/lib/site/site";
import type { Icon } from "@phosphor-icons/react/lib";
import {
  BinocularsIcon as Binoculars,
  BookOpenTextIcon as BookOpenText,
  ChartLineUpIcon as ChartLineUp,
  ClockCounterClockwiseIcon as ClockCounterClockwise,
  GearSixIcon as GearSix,
  GlobeIcon as Globe,
  LinkIcon as Link,
  MapTrifoldIcon as MapTrifold,
  PuzzlePieceIcon as PuzzlePiece,
  RankingIcon as Ranking,
  ShieldCheckIcon as ShieldCheck,
  SirenIcon as Siren,
  SparkleIcon as Sparkle,
  SquaresFourIcon as SquaresFour,
  UsersThreeIcon as UsersThree,
} from "@phosphor-icons/react/ssr";

/**
 * One icon size for every tile in the sidebar rail. The logo mark, the workspace tile and the
 * nav rows used to carry three different values, which is what made the collapsed column read
 * as ragged rather than as a single column of 40px squares.
 */
export const RAIL_ICON_SIZE = 18;

export type NavBadge = "new" | "alpha" | "experimental";

/**
 * The rail has exactly three groups and every destination sits in one of them. There is no
 * ungrouped block: an id without a heading used to be hardcoded by each renderer, which is how
 * the same list came to be maintained three times.
 */
export type NavItemGroup = "activity" | "modules" | "project";

/**
 * What a destination is scoped to.
 *
 * - `level` follows whatever level the viewer is on, the project or a market.
 * - `market` is a module that narrows to the selected market.
 * - `own-axis` analyses something a market does not narrow, so it stays at the project route.
 * - `project` configures the project itself and is never market-scoped.
 */
export type NavScope = "level" | "market" | "own-axis" | "project";

export type NavItem = {
  /** The rail consumes this grouping while command-palette navigation stays flat. */
  group: NavItemGroup;
  label: string;
  href: string;
  icon: Icon;
  scope: NavScope;
  badge?: NavBadge;
  external?: boolean;
};

/**
 * A destination that is reachable but is not a rail row, so it carries neither a group nor a
 * scope. Giving these a group would invite a renderer to put them in the rail.
 */
export type AuxNavItem = Omit<NavItem, "group" | "scope">;

/**
 * Route segments eligible for the account "default landing page" preference. This stays
 * narrower than the rail: project configuration surfaces are navigable but are not landing pages.
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

export type NavItemGroupDescriptor = {
  id: NavItemGroup;
  label: string;
  /** The collapsed rail is 80px wide and shows this in place of the label. */
  tag: string;
  /** What the group is scoped to. It belongs in the heading's tooltip, never under it. */
  tooltip: string;
};

// Headings never change with the navigation level: the same three captions read the same whether
// the viewer is on the project or inside a market. Only the rows below them resolve differently.
export const navItemGroups = [
  {
    id: "activity",
    label: "Activity",
    tag: "ACTIVITY",
    tooltip: "Follows the level you are on: the project, or the market you switched into.",
  },
  {
    id: "modules",
    label: "Modules",
    tag: "MODULES",
    tooltip: "Market modules follow the selected market. The rest keep their own axis.",
  },
  {
    id: "project",
    label: "Project",
    tag: "PROJECT",
    tooltip: "Project-wide configuration. A market never narrows it.",
  },
] as const satisfies readonly NavItemGroupDescriptor[];

type NavEntry = Omit<NavItem, "href"> & { segment: string };

type RailNavEntry = NavEntry & { experimentalModule?: ExperimentalModuleKey };

/**
 * Where the rail points once a market level exists.
 *
 * `marketSegments` comes from `navContextFromPathname`, which reads the current URL through the
 * shared route parser. With no market context every row resolves to its project route.
 */
export type NavContext = {
  marketSegments?: readonly string[];
};

const MARKET_FOLLOWING_SCOPES: ReadonlySet<NavScope> = new Set<NavScope>(["level", "market"]);

/** Derives the rail context from the URL, never from a cookie or stored preference. */
export function navContextFromPathname(pathname: string): NavContext | undefined {
  const context = appPathContext(pathname);
  return context.kind === "market" ? { marketSegments: [MARKET_SEGMENT, context.ref] } : undefined;
}

/** Builds one rail href from its scope, current context, and the routes that exist today. */
export function navItemHref(
  entry: Readonly<{ scope: NavScope; segment: string }>,
  projectRef: string,
  context?: NavContext,
): string {
  const marketSegments =
    MARKET_FOLLOWING_SCOPES.has(entry.scope) && hasMarketRoute(sectionPathOf([entry.segment]))
      ? (context?.marketSegments ?? [])
      : [];
  return appPath(projectRef, ...marketSegments, entry.segment);
}

// Keyword research scouts the market (Binoculars); Rank Tracker is the podium of tracked
// positions (Ranking). Markets takes the folded map rather than a globe, because Domain Overview
// already owns the globe and two globes in one rail read as the same destination twice.
// The order is the rail order: inside Modules the market-scoped rows come first and the own-axis
// rows after, and that order is the only sub-structure the group has. `landingSegments`
// deliberately preserves the independent preference order above rather than treating every
// reachable rail item as a landing page.
const railNavEntries = [
  {
    group: "activity",
    label: "Dashboard",
    scope: "level",
    segment: "dashboard",
    icon: SquaresFour,
  },
  {
    group: "activity",
    label: "Timeline",
    scope: "level",
    segment: "timeline",
    icon: ClockCounterClockwise,
    badge: "experimental",
    experimentalModule: "timeline",
  },
  {
    group: "activity",
    label: "Alerts",
    scope: "level",
    segment: "alerts",
    icon: Siren,
    badge: "alpha",
  },
  {
    group: "modules",
    label: "Rank Tracker",
    scope: "market",
    segment: "rank-tracker",
    icon: Ranking,
  },
  {
    group: "modules",
    label: "Competitors",
    scope: "market",
    segment: "competitors",
    icon: UsersThree,
    badge: "experimental",
    experimentalModule: "competitors",
  },
  {
    group: "modules",
    label: "Keyword Research",
    scope: "own-axis",
    segment: "keyword-research",
    icon: Binoculars,
  },
  {
    group: "modules",
    label: "Domain Overview",
    scope: "own-axis",
    segment: "domain-overview",
    icon: Globe,
  },
  { group: "modules", label: "Backlinks", scope: "own-axis", segment: "backlinks", icon: Link },
  {
    group: "modules",
    label: "Search Console",
    scope: "own-axis",
    segment: SEARCH_CONSOLE_SEGMENT,
    icon: ChartLineUp,
    badge: "alpha",
  },
  { group: "project", label: "Markets", scope: "project", segment: "markets", icon: MapTrifold },
  {
    group: "project",
    label: "Integrations",
    scope: "project",
    segment: "integrations",
    icon: PuzzlePiece,
  },
  { group: "project", label: "Install", scope: "project", segment: "install", icon: Sparkle },
  { group: "project", label: "Settings", scope: "project", segment: "settings", icon: GearSix },
] as const satisfies readonly RailNavEntry[];

export const primaryNavEntries: readonly PrimaryNavEntry[] = landingSegments.map((segment) => {
  const entry = railNavEntries.find((item) => item.segment === segment);
  if (!entry) {
    throw new Error(`Missing landing navigation entry for ${segment}`);
  }

  return { label: entry.label, segment, icon: entry.icon };
});

export function navItems(
  projectRef: string,
  context?: NavContext,
  enabledExperimentalModules: readonly ExperimentalModuleKey[] = [],
): NavItem[] {
  return railNavEntries
    .filter((entry) => {
      const experimentalModule = (entry as RailNavEntry).experimentalModule;
      return (
        !experimentalModule || hasExperimentalModule(enabledExperimentalModules, experimentalModule)
      );
    })
    .map((entry) => {
      const { experimentalModule: _experimentalModule, segment, ...item } = entry as RailNavEntry;
      return {
        ...item,
        href: navItemHref({ scope: item.scope, segment }, projectRef, context),
      };
    });
}

export const docsNavItem = {
  label: "Docs and self-hosting",
  href: DOCS_URL,
  icon: BookOpenText,
  external: true,
} satisfies AuxNavItem;

export const instanceAdminNavItem = {
  label: "Instance admin",
  href: appRootPath("admin"),
  icon: ShieldCheck,
} satisfies AuxNavItem;
