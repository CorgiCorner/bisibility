import type { PagesByTagRow, ProjectPageTagOption } from "@/lib/pages/tag-view";
import { emptyPageTagForm, type PageTagFormValues } from "@/lib/schemas/page-tag";

export function pageTagFormForTag(tag: Pick<ProjectPageTagOption, "name">): PageTagFormValues {
  return { ...emptyPageTagForm, tagName: tag.name };
}

export function pageTagFormForRow(row: Pick<PagesByTagRow, "name" | "rule">): PageTagFormValues {
  return {
    autoJoin: row.rule?.autoJoin ?? true,
    excludePatterns: row.rule?.excludePatterns ?? [],
    kind: row.rule?.kind ?? "manual",
    pattern: row.rule?.pattern ?? "",
    sitemapUrl: row.rule?.sitemapUrl ?? "",
    tagName: row.name,
    tagTargetingKeywords: row.rule?.tagTargetingKeywords ?? false,
    urlsText: (row.rule?.urls ?? []).join("\n"),
  };
}
