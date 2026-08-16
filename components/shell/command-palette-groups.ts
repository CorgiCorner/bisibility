"use client";

import type { KeywordHit } from "@/components/shell/keyword-search";
import { applyTheme, readTheme } from "@/components/shell/set-theme";
import { authClient } from "@/lib/auth/client";
import { rankTrackerActionHref } from "@/lib/keywords/rank-tracker-command";
import { docsNavItem, navItems } from "@/lib/nav/nav-items";
import { appPath } from "@/lib/routing/app-path";
import {
  DownloadSimpleIcon as DownloadSimple,
  MagnifyingGlassIcon as MagnifyingGlass,
  PaletteIcon as Palette,
  PlusIcon as Plus,
  SignOutIcon as SignOut,
  UploadSimpleIcon as UploadSimple,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";

export type CommandItem = {
  icon?: Icon;
  id?: string;
  label: string;
  hint: string;
  run: () => void | Promise<void>;
};

export type CommandGroup = {
  title: "Actions" | "Keywords" | "Navigate" | "On this page";
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
        window.location.href = "/login";
      },
    },
  ];
}
