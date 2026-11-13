import type { TagPageRuleKind } from "./tag-pattern";

export type ProjectPageTagOption = {
  id: string;
  keywordCount: number;
  name: string;
};

export type PageTagRuleView = {
  autoJoin: boolean;
  excludePatterns: string[];
  kind: TagPageRuleKind;
  pattern: string | null;
  sitemapUrl: string | null;
  tagTargetingKeywords: boolean;
  urls: string[];
};

export type PagesByTagRow = {
  existingPages: number;
  keywords: number;
  name: string;
  newPages: number;
  pages: number;
  removedPages: number;
  rule: PageTagRuleView | null;
  tagId: string;
};

export type ProjectPageTagView = {
  keywordOnly: ProjectPageTagOption[];
  options: ProjectPageTagOption[];
  rows: PagesByTagRow[];
  sitemaps: string[];
  tagCount: number;
};

export const emptyProjectPageTagView: ProjectPageTagView = {
  keywordOnly: [],
  options: [],
  rows: [],
  sitemaps: [],
  tagCount: 0,
};
