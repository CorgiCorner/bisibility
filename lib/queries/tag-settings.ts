import "server-only";

import { prisma } from "@/lib/db/prisma";
import { normalizeSavedViewConfig } from "@/lib/keywords/saved-view-model";
import { type TagPageRuleKind, tagPageRuleKinds } from "@/lib/pages/tag-pattern";
import { listProjectSitemapUrls } from "@/lib/pages/tag-queries";
import type { PageTagRuleView } from "@/lib/pages/tag-view";
import { segmentCountByTag } from "./tag-usage";

export type SettingsTagUsageKind = "alert" | "keyword_segment" | "saved_view";

export type SettingsTagUsageItem = {
  kind: SettingsTagUsageKind;
  name: string;
};

export type SettingsTagRuleLabel =
  | { kind: "hand" }
  | { kind: "none" }
  | { kind: "pattern"; pattern: string }
  | { kind: "sitemap" }
  | { kind: "urls"; count: number };

export type SettingsTagRow = {
  id: string;
  keywords: number;
  name: string;
  pages: number;
  rule: PageTagRuleView | null;
  ruleLabel: SettingsTagRuleLabel;
  segmentCount: number;
  usage: SettingsTagUsageItem[];
};

export type SettingsTagsModel = {
  rows: SettingsTagRow[];
  sitemaps: string[];
};

type StoredRule = {
  autoJoin: boolean;
  excludePatterns: string[];
  kind: string;
  pattern: string | null;
  sitemapUrl: string | null;
  tagTargetingKeywords: boolean;
  urls: string[];
};

export type SettingsTagRecord = {
  alertTargets: { rule: { name: string } }[];
  name: string;
  pageRule: StoredRule | null;
  publicId: string;
  _count: { keywords: number; pageLinks: number };
};

export type SettingsTagViewRecord = {
  config: unknown;
  name: string;
  surface: string;
};

function tagKey(name: string) {
  return name.trim().toLocaleLowerCase();
}

function ruleView(rule: StoredRule | null): PageTagRuleView | null {
  if (!rule || !tagPageRuleKinds.includes(rule.kind as TagPageRuleKind)) return null;
  return {
    autoJoin: rule.autoJoin,
    excludePatterns: rule.excludePatterns,
    kind: rule.kind as TagPageRuleKind,
    pattern: rule.pattern,
    sitemapUrl: rule.sitemapUrl,
    tagTargetingKeywords: rule.tagTargetingKeywords,
    urls: rule.urls,
  };
}

export function settingsTagRuleLabel(
  rule: PageTagRuleView | null,
  pages: number,
): SettingsTagRuleLabel {
  if (!rule) return pages === 0 ? { kind: "none" } : { kind: "hand" };
  if (rule.kind === "path_pattern" && rule.pattern) {
    return { kind: "pattern", pattern: rule.pattern };
  }
  if (rule.kind === "url_list") return { kind: "urls", count: rule.urls.length };
  if (rule.kind === "sitemap") return { kind: "sitemap" };
  return { kind: "hand" };
}

function usageForTag(
  name: string,
  views: readonly SettingsTagViewRecord[],
): SettingsTagUsageItem[] {
  const key = tagKey(name);
  const items: SettingsTagUsageItem[] = [];
  for (const view of views) {
    const matches = normalizeSavedViewConfig(view.config).filters.tags.some(
      (tag) => tagKey(tag) === key,
    );
    if (!matches) continue;
    items.push({
      kind: view.surface === "keywords" ? "keyword_segment" : "saved_view",
      name: view.name,
    });
  }
  return items;
}

export function buildSettingsTagRows(
  tags: readonly SettingsTagRecord[],
  views: readonly SettingsTagViewRecord[],
): SettingsTagRow[] {
  const segments = segmentCountByTag(views);
  return tags.map((tag) => {
    const rule = ruleView(tag.pageRule);
    const pages = tag._count.pageLinks;
    const viewUsage = usageForTag(tag.name, views);
    const alerts = tag.alertTargets.map((target) => ({
      kind: "alert" as const,
      name: target.rule.name,
    }));
    return {
      id: tag.publicId,
      keywords: tag._count.keywords,
      name: tag.name,
      pages,
      rule,
      ruleLabel: settingsTagRuleLabel(rule, pages),
      segmentCount: segments.get(tagKey(tag.name)) ?? 0,
      usage: [...alerts, ...viewUsage],
    };
  });
}

export async function getSettingsTags(projectId: string): Promise<SettingsTagsModel> {
  const [tags, views, sitemaps] = await Promise.all([
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: {
        _count: { select: { keywords: true, pageLinks: true } },
        alertTargets: { select: { rule: { select: { name: true } } } },
        name: true,
        pageRule: {
          select: {
            autoJoin: true,
            excludePatterns: true,
            kind: true,
            pattern: true,
            sitemapUrl: true,
            tagTargetingKeywords: true,
            urls: true,
          },
        },
        publicId: true,
      },
      where: { projectId },
    }),
    prisma.savedView.findMany({
      orderBy: { name: "asc" },
      select: { config: true, name: true, surface: true },
      where: { projectId },
    }),
    listProjectSitemapUrls(projectId),
  ]);
  return { rows: buildSettingsTagRows(tags, views), sitemaps };
}
