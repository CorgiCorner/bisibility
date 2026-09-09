import { hasMarketRoute, sectionPathOf } from "@/lib/markets/market-route-sections";
import {
  appPath,
  appPathContext,
  appRootPath,
  MARKET_SEGMENT,
  SEARCH_CONSOLE_SEGMENT,
} from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import {
  type ExperimentalModuleKey,
  hasExperimentalModule,
} from "@/lib/settings/experimental-modules";
import { DOCS_URL } from "@/lib/site/site";
import { BinocularsIcon as Binoculars } from "@phosphor-icons/react/dist/ssr/Binoculars";
import { BookOpenTextIcon as BookOpenText } from "@phosphor-icons/react/dist/ssr/BookOpenText";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/dist/ssr/GearSix";
import { GlobeIcon as Globe } from "@phosphor-icons/react/dist/ssr/Globe";
import { LinkIcon as Link } from "@phosphor-icons/react/dist/ssr/Link";
import { MapTrifoldIcon as MapTrifold } from "@phosphor-icons/react/dist/ssr/MapTrifold";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/dist/ssr/PlayCircle";
import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/dist/ssr/PuzzlePiece";
import { RankingIcon as Ranking } from "@phosphor-icons/react/dist/ssr/Ranking";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { SirenIcon as Siren } from "@phosphor-icons/react/dist/ssr/Siren";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import type { Icon } from "@phosphor-icons/react/lib";

/**
 * One icon size for every tile in the sidebar rail. The logo mark, the workspace tile and the
 * nav rows used to carry three different values, which is what made the collapsed column read
 * as ragged rather than as a single column of 40px squares.
 */
export const RAIL_ICON_SIZE = 18;

export type NavBadge = "new" | "alpha" | "beta" | "experimental";

/**
 * Headed rail groups. Dashboard intentionally stays outside them at the top of every rail.
 */
export type NavItemGroup = "modules" | "project";

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
  group: NavItemGroup | null;
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

const landingNavEntries = {
  dashboard: { icon: SquaresFour, label: "Dashboard" },
  "search-console": { icon: ChartLineUp, label: "Search Console" },
  "keyword-research": { icon: Binoculars, label: "Keyword Research" },
  "domain-overview": { icon: Globe, label: "Domain Overview" },
  "rank-tracker": { icon: Ranking, label: "Rank Tracker" },
  backlinks: { icon: Link, label: "Backlinks" },
  competitors: { icon: UsersThree, label: "Competitors" },
  timeline: { icon: ClockCounterClockwise, label: "Timeline" },
} as const satisfies Record<LandingSegment, Omit<PrimaryNavEntry, "segment">>;

export type NavItemGroupDescriptor = {
  id: NavItemGroup;
  label: string;
  /** The collapsed rail is 80px wide and shows this in place of the label. */
  tag: string;
  /** What the group is scoped to. It belongs in the heading's tooltip, never under it. */
  tooltip: string;
};

export const navItemGroups = [
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
const GLOBAL_FEED_SEGMENTS = new Set(["alerts", "timeline"]);

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
  if (entry.segment === "runs") return projectRunsPath(projectRef);
  const marketRef =
    context?.marketSegments?.[0] === MARKET_SEGMENT ? context.marketSegments[1] : undefined;
  if (marketRef && GLOBAL_FEED_SEGMENTS.has(entry.segment)) {
    return `${appPath(projectRef, entry.segment)}?f=market:${encodeURIComponent(marketRef)}`;
  }
  const marketSegments =
    MARKET_FOLLOWING_SCOPES.has(entry.scope) && hasMarketRoute(sectionPathOf([entry.segment]))
      ? (context?.marketSegments ?? [])
      : [];
  return appPath(projectRef, ...marketSegments, entry.segment);
}

const railNavEntries = [
  {
    group: null,
    label: "Dashboard",
    scope: "level",
    segment: "dashboard",
    icon: SquaresFour,
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
    badge: "beta",
  },
  { group: "project", label: "Markets", scope: "project", segment: "markets", icon: MapTrifold },
  {
    group: "project",
    label: "Alerts",
    scope: "project",
    segment: "alerts",
    icon: Siren,
    badge: "alpha",
  },
  { group: "project", label: "Runs", scope: "project", segment: "runs", icon: PlayCircle },
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

export const primaryNavEntries: readonly PrimaryNavEntry[] = landingSegments.map((segment) => ({
  ...landingNavEntries[segment],
  segment,
}));

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
