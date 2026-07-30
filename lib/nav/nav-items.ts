import { appPath, appRootPath } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import type { Icon } from "@phosphor-icons/react/lib";
import {
  BellIcon as Bell,
  BookOpenTextIcon as BookOpenText,
  CalendarDotsIcon as CalendarDots,
  ClockCounterClockwiseIcon as ClockCounterClockwise,
  GearSixIcon as GearSix,
  LinkIcon as Link,
  MagnifyingGlassIcon as MagnifyingGlass,
  PuzzlePieceIcon as PuzzlePiece,
  RankingIcon as Ranking,
  ShieldCheckIcon as ShieldCheck,
  SquaresFourIcon as SquaresFour,
  UsersThreeIcon as UsersThree,
} from "@phosphor-icons/react/ssr";

export type NavBadge = "Soon";

export type NavItem = {
  label: string;
  href: string;
  icon: Icon;
  badge?: NavBadge;
  external?: boolean;
};

export function navItems(projectRef: string): NavItem[] {
  return [
    { label: "Overview", href: appPath(projectRef, "overview"), icon: SquaresFour },
    { label: "Research", href: appPath(projectRef, "research"), icon: MagnifyingGlass },
    { label: "Keywords", href: appPath(projectRef, "keywords"), icon: Ranking },
    { label: "Backlinks", href: appPath(projectRef, "backlinks"), icon: Link },
    { label: "Checks", href: appPath(projectRef, "checks"), icon: CalendarDots },
    { label: "Integrations", href: appPath(projectRef, "integrations"), icon: PuzzlePiece },
    { label: "Competitors", href: appPath(projectRef, "competitors"), icon: UsersThree },
    { label: "Timeline", href: appPath(projectRef, "timeline"), icon: ClockCounterClockwise },
    { label: "Alerts", href: appPath(projectRef, "alerts"), icon: Bell },
    { label: "Settings", href: appPath(projectRef, "settings"), icon: GearSix },
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
