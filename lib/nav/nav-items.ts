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
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { FilesIcon as Files } from "@phosphor-icons/react/dist/ssr/Files";
import { GaugeIcon as Gauge } from "@phosphor-icons/react/dist/ssr/Gauge";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/dist/ssr/GearSix";
import { GlobeIcon as Globe } from "@phosphor-icons/react/dist/ssr/Globe";
import { LinkIcon as Link } from "@phosphor-icons/react/dist/ssr/Link";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { MapTrifoldIcon as MapTrifold } from "@phosphor-icons/react/dist/ssr/MapTrifold";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/dist/ssr/NotePencil";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/dist/ssr/PlayCircle";
import { PuzzlePieceIcon as PuzzlePiece } from "@phosphor-icons/react/dist/ssr/PuzzlePiece";
import { RankingIcon as Ranking } from "@phosphor-icons/react/dist/ssr/Ranking";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { SirenIcon as Siren } from "@phosphor-icons/react/dist/ssr/Siren";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import type { Icon } from "@phosphor-icons/react/lib";
import { landingNavEntries, landingSegments, type PrimaryNavEntry } from "./landing-nav";
import {
  agentReportsNavEntry,
  aiSearchNavEntries,
  aiVisibilityNavEntry,
  researchModuleNavEntries,
} from "./research-nav";

export type { LandingSegment } from "./landing-nav";
export { landingSegments } from "./landing-nav";

/** One icon size for every sidebar rail tile, so the collapsed column stays one width. */
export const RAIL_ICON_SIZE = 18;

export type NavBadge = "new" | "experimental";

/** Headed rail groups. Dashboard stays outside them at the top of every rail. */
export type NavItemGroup = "seo" | "ai" | "reports" | "project";

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
  activeHrefs?: readonly string[];
  /** Extra command-palette search terms. The catalog owns the translated list. */
  keywords?: readonly string[];
  external?: boolean;
};

/**
 * A destination that is reachable but is not a rail row, so it carries neither a group nor a
 * scope. Giving these a group would invite a renderer to put them in the rail.
 */
export type AuxNavItem = Omit<NavItem, "group" | "scope">;

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
    id: "seo",
    label: "SEO",
    tag: "SEO",
    tooltip: "Track rankings and research keywords, websites, backlinks and site health.",
  },
  {
    id: "ai",
    label: "AI visibility",
    tag: "AI",
    tooltip: "Track brand visibility in AI answers.",
  },
  {
    id: "reports",
    label: "Data & reports",
    tag: "DATA",
    tooltip: "Review connected search data and saved reports.",
  },
  {
    id: "project",
    label: "Project",
    tag: "PROJECT",
    tooltip: "Project configuration and shared operations.",
  },
] as const satisfies readonly NavItemGroupDescriptor[];

export type NavEntry = Omit<NavItem, "href"> & {
  segment: string;
  experimentalModule?: ExperimentalModuleKey;
};

type RailNavEntry = NavEntry & { experimentalModule?: ExperimentalModuleKey };

/** Market context comes from the current URL; absent context keeps project routes. */
export type NavContext = {
  marketSegments?: readonly string[];
};

const MARKET_FOLLOWING_SCOPES: ReadonlySet<NavScope> = new Set<NavScope>(["level", "market"]);
const GLOBAL_FEED_SEGMENTS = new Set(["alerts"]);

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
    group: "seo",
    label: "Rank Tracker",
    scope: "market",
    segment: "rank-tracker",
    icon: Ranking,
  },
  {
    group: "seo",
    label: "SERP Playground",
    scope: "own-axis",
    segment: "serp-playground",
    icon: MagnifyingGlass,
  },
  {
    group: "seo",
    label: "Keyword Research",
    scope: "own-axis",
    segment: "keyword-research",
    icon: Binoculars,
  },
  {
    group: "seo",
    label: "Domain Overview",
    scope: "own-axis",
    segment: "domain-overview",
    icon: Globe,
  },
  { group: "seo", label: "Backlinks", scope: "own-axis", segment: "backlinks", icon: Link },
  ...researchModuleNavEntries,
  {
    group: "seo",
    label: "Competitors",
    scope: "market",
    segment: "competitors",
    icon: UsersThree,
    badge: "experimental",
    experimentalModule: "competitors",
  },
  aiVisibilityNavEntry,
  ...aiSearchNavEntries,
  {
    group: "reports",
    label: "Pages",
    scope: "own-axis",
    segment: "pages",
    icon: Files,
    badge: "new",
  },
  {
    group: "reports",
    label: "Search Console",
    scope: "own-axis",
    segment: SEARCH_CONSOLE_SEGMENT,
    icon: ChartLineUp,
  },
  {
    group: "reports",
    label: "Annotations",
    scope: "own-axis",
    segment: "annotations",
    icon: NotePencil,
    badge: "new",
  },
  agentReportsNavEntry,
  { group: "project", label: "Markets", scope: "project", segment: "markets", icon: MapTrifold },
  {
    group: "project",
    label: "Alerts",
    scope: "project",
    segment: "alerts",
    icon: Siren,
  },
  { group: "project", label: "Runs", scope: "project", segment: "runs", icon: PlayCircle },
  {
    group: "project",
    label: "Schedules",
    scope: "project",
    segment: "schedules",
    icon: CalendarBlank,
  },
  {
    group: "project",
    label: "Providers",
    scope: "project",
    segment: "providers",
    icon: PuzzlePiece,
  },
  { group: "project", label: "Usage", scope: "project", segment: "usage", icon: Gauge },
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
        ...(segment === "settings" ? { activeHrefs: [appPath(projectRef, "context")] } : {}),
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
