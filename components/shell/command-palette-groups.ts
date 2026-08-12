"use client";

import { runKeywordCommandFromPalette } from "@/components/shell/keyword-command-actions";
import type { KeywordHit } from "@/components/shell/keyword-search";
import { applyTheme, readTheme } from "@/components/shell/set-theme";
import { authClient } from "@/lib/auth/client";
import { docsNavItem, navItems } from "@/lib/nav/nav-items";
import { appPath } from "@/lib/routing/app-path";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  DownloadSimpleIcon as DownloadSimple,
  FunnelSimpleIcon as FunnelSimple,
  MagnifyingGlassIcon as MagnifyingGlass,
  PaletteIcon as Palette,
  PlusIcon as Plus,
  SignOutIcon as SignOut,
  UploadSimpleIcon as UploadSimple,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";

export type CommandItem = {
  icon: Icon;
  label: string;
  hint: string;
  run: () => void | Promise<void>;
};

type CommandGroup = {
  title: "Actions" | "Keywords" | "Navigate";
  items: CommandItem[];
};

export function commandGroups(
  projectRef: string,
  push: (href: string) => void,
  setMode: (mode: "dark" | "light") => void,
  keywordHits: KeywordHit[],
): CommandGroup[] {
  const navigate = [...navItems(projectRef), docsNavItem].map((item) => ({
    icon: item.icon,
    label: item.label,
    hint: "Go to",
    run: item.external
      ? () => {
          window.open(item.href, "_blank", "noopener,noreferrer");
        }
      : () => push(item.href),
  }));

  const keywords = keywordHits.map((hit) => ({
    icon: MagnifyingGlass,
    label: hit.label,
    hint: "Keyword",
    run: () => push(appPath(projectRef, "rank-tracker", hit.id)),
  }));

  return [
    { title: "Navigate", items: navigate },
    { title: "Keywords", items: keywords },
    { title: "Actions", items: actionItems(projectRef, push, setMode) },
  ];
}

export function filterGroups(groups: CommandGroup[], query: string) {
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

function actionItems(
  projectRef: string,
  push: (href: string) => void,
  setMode: (mode: "dark" | "light") => void,
): CommandItem[] {
  return [
    {
      icon: Plus,
      label: "Add keyword",
      hint: "Action",
      run: () => runKeywordCommandFromPalette(projectRef, "add", push),
    },
    {
      icon: UploadSimple,
      label: "Import CSV",
      hint: "Action",
      run: () => runKeywordCommandFromPalette(projectRef, "import", push),
    },
    {
      icon: DownloadSimple,
      label: "Export",
      hint: "Action",
      run: () => runKeywordCommandFromPalette(projectRef, "export", push),
    },
    {
      icon: FunnelSimple,
      label: "Filter",
      hint: "Action",
      run: () => runKeywordCommandFromPalette(projectRef, "filter", push),
    },
    {
      icon: ArrowsClockwise,
      label: "Run rank checks",
      hint: "Action",
      run: () => runKeywordCommandFromPalette(projectRef, "run-check", push),
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
        window.location.href = "/login";
      },
    },
  ];
}
