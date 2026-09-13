"use client";

import type { KeywordHit } from "@/components/shell/keyword-search";
import { applyTheme, readTheme } from "@/components/shell/set-theme";
import { authClient } from "@/lib/auth/client";
import { notifyAuthenticatedSessionEnd } from "@/lib/auth/session-end";
import { rankTrackerActionHref } from "@/lib/keywords/rank-tracker-command";
import { hasMarketRoute, sectionPathOf } from "@/lib/markets/market-route-sections";
import { docsNavItem, type NavContext, navItems } from "@/lib/nav/nav-items";
import { appPath, appSectionPath, type MarketRef, marketPath } from "@/lib/routing/app-path";
import type { ExperimentalModuleKey } from "@/lib/settings/experimental-modules";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { PaletteIcon as Palette } from "@phosphor-icons/react/dist/csr/Palette";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/dist/csr/SignOut";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import type { Icon } from "@phosphor-icons/react/lib";

export type CommandItem = {
  icon?: Icon;
  id?: string;
  label: string;
  hint: string;
  run: () => void | Promise<void>;
};

export type CommandGroup = {
  title: "Actions" | "Keywords" | "Markets" | "Navigate" | "On this page";
  items: CommandItem[];
};

/**
 * A market the palette may offer, already carrying the name the reader sees elsewhere. The
 * palette composes the sentence and holds no opinion about how a market is labelled, so a
 * later change to that naming cannot leave a second copy of the rule here.
 */
export type PaletteMarket = { label: string; ref: MarketRef };

export function commandGroups(
  projectRef: string,
  push: (href: string) => void,
  setMode: (mode: "dark" | "light") => void,
  keywordHits: KeywordHit[],
  markets: readonly PaletteMarket[] = [],
  context?: NavContext,
  enabledExperimentalModules: readonly ExperimentalModuleKey[] = [],
): CommandGroup[] {
  const navigate = [...navItems(projectRef, context, enabledExperimentalModules), docsNavItem].map(
    (item) => ({
      icon: item.icon,
      label: item.label,
      hint: "Go to",
      run: item.external
        ? () => {
            window.open(item.href, "_blank", "noopener,noreferrer");
          }
        : () => push(item.href),
    }),
  );

  const keywords = keywordHits.map((hit) => ({
    icon: MagnifyingGlass,
    label: hit.label,
    hint: "Keyword",
    run: () => push(appPath(projectRef, "rank-tracker", hit.id)),
  }));

  const marketRows = marketItems(projectRef, markets, push);

  return [
    // Above Navigate: a market row answers the same question more precisely, and a reader who
    // has markets at all is usually after one of them. With no markets there is no group, so
    // a project that tracks none sees exactly the palette it saw before.
    ...(marketRows.length > 0 ? [{ title: "Markets" as const, items: marketRows }] : []),
    { title: "Navigate", items: navigate },
    { title: "Keywords", items: keywords },
    { title: "Actions", items: actionItems(projectRef, push, setMode) },
  ];
}

export function filterGroups(groups: CommandGroup[], query: string): CommandGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return groups;
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(normalized)),
    }))
    .filter((group) => group.items.length > 0);
}

/** The section segments of a nav href: `/app/prj_1/rank-tracker` becomes `["rank-tracker"]`. */
function sectionSegments(href: string): string[] {
  return appSectionPath(href).split("/").filter(Boolean);
}

/**
 * One row per market per section that actually renders under `m/{market}`. The gate is
 * `hasMarketRoute`, the same list every other market URL in this app is built from, so a
 * section the market layer does not serve can never be offered here and 404 the reader.
 *
 * Rows carry an explicit id because the palette otherwise keys an item by its group title and
 * label, and two markets are free to read the same to a human.
 */
function marketItems(
  projectRef: string,
  markets: readonly PaletteMarket[],
  push: (href: string) => void,
): CommandItem[] {
  const routed = navItems(projectRef)
    .map((item) => ({ ...item, segments: sectionSegments(item.href) }))
    .filter((item) => hasMarketRoute(sectionPathOf(item.segments)));

  return markets.flatMap((market) =>
    routed.map((item) => ({
      icon: item.icon,
      id: `market:${market.ref}:${item.segments.join("/")}`,
      label: `${item.label} in ${market.label}`,
      hint: "Market",
      run: () => push(marketPath(projectRef, market.ref, ...item.segments)),
    })),
  );
}

function actionItems(
  projectRef: string,
  push: (href: string) => void,
  setMode: (mode: "dark" | "light") => void,
): CommandItem[] {
  return [
    {
      icon: Plus,
      label: "Rank Tracker: Add keyword",
      hint: "New keyword",
      run: () => push(rankTrackerActionHref(projectRef, "add")),
    },
    {
      icon: UploadSimple,
      label: "Rank Tracker: Import CSV",
      hint: "Upload file",
      run: () => push(rankTrackerActionHref(projectRef, "import")),
    },
    {
      icon: DownloadSimple,
      label: "Rank Tracker: Export keywords",
      hint: "Download file",
      run: () => push(rankTrackerActionHref(projectRef, "export")),
    },
    {
      icon: Palette,
      label: "Toggle theme",
      hint: "Theme",
      run: () => {
        const next = readTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        setMode(next);
      },
    },
    {
      icon: SignOut,
      label: "Sign out",
      hint: "Account",
      run: async () => {
        await authClient.signOut();
        notifyAuthenticatedSessionEnd();
        window.location.href = "/login";
      },
    },
  ];
}
