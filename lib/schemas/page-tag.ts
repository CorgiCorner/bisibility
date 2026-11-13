import {
  splitTagRuleLines,
  TAG_RULE_EXCLUDE_MAX,
  TAG_RULE_URL_MAX,
  tagPageRuleKinds,
  tagPatternCode,
} from "@/lib/pages/tag-pattern";
import { z } from "zod";

const projectIdSchema = z.string().trim().min(1).max(120);
const tagIdSchema = z.string().trim().min(1).max(80);

export const pageTagFormSchema = z
  .object({
    autoJoin: z.boolean(),
    excludePatterns: z.array(z.string()).max(TAG_RULE_EXCLUDE_MAX),
    kind: z.enum(tagPageRuleKinds),
    pattern: z.string().max(500),
    sitemapUrl: z.string().max(2_000),
    tagName: z.string().trim().max(48, "tag_required"),
    tagTargetingKeywords: z.boolean(),
    urlsText: z.string().max(200_000),
  })
  .superRefine((value, ctx) => {
    if (!value.tagName) {
      ctx.addIssue({ code: "custom", message: "tag_required", path: ["tagName"] });
    }
    for (const pattern of value.excludePatterns) {
      if (tagPatternCode(pattern)) {
        ctx.addIssue({ code: "custom", message: "exclude_invalid", path: ["excludePatterns"] });
        break;
      }
    }
    if (value.kind === "path_pattern") {
      const code = tagPatternCode(value.pattern);
      if (code) ctx.addIssue({ code: "custom", message: code, path: ["pattern"] });
    }
    if (value.kind === "sitemap") {
      const url = value.sitemapUrl.trim();
      if (!url) {
        ctx.addIssue({ code: "custom", message: "sitemap_required", path: ["sitemapUrl"] });
      } else if (!/^https?:\/\//iu.test(url)) {
        ctx.addIssue({ code: "custom", message: "sitemap_required", path: ["sitemapUrl"] });
      }
    }
    if (value.kind === "url_list") {
      const urls = splitTagRuleLines(value.urlsText);
      if (urls.length === 0) {
        ctx.addIssue({ code: "custom", message: "invalid_url", path: ["urlsText"] });
      }
      if (urls.length > TAG_RULE_URL_MAX) {
        ctx.addIssue({ code: "custom", message: "too_many_urls", path: ["urlsText"] });
      }
    }
  });

export type PageTagFormValues = z.infer<typeof pageTagFormSchema>;

export const emptyPageTagForm: PageTagFormValues = {
  autoJoin: true,
  excludePatterns: [],
  kind: "path_pattern",
  pattern: "",
  sitemapUrl: "",
  tagName: "",
  tagTargetingKeywords: false,
  urlsText: "",
};

export const savePageTagRuleSchema = pageTagFormSchema.and(
  z.object({ projectId: projectIdSchema, tagId: tagIdSchema.optional() }),
);

export const previewPageTagRuleSchema = z
  .object({
    excludePatterns: z.array(z.string()).max(TAG_RULE_EXCLUDE_MAX),
    kind: z.enum(tagPageRuleKinds),
    pattern: z.string().max(500),
    projectId: projectIdSchema,
    sitemapUrl: z.string().max(2_000),
    urls: z.array(z.string()).max(TAG_RULE_URL_MAX),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "path_pattern") {
      const code = tagPatternCode(value.pattern);
      if (code) ctx.addIssue({ code: "custom", message: code, path: ["pattern"] });
    }
    for (const pattern of value.excludePatterns) {
      if (tagPatternCode(pattern)) {
        ctx.addIssue({ code: "custom", message: "exclude_invalid", path: ["excludePatterns"] });
      }
    }
  });

export const manualPageTagsSchema = z.object({
  add: z.array(z.string().trim().min(1).max(2_000)).max(500),
  projectId: projectIdSchema,
  remove: z.array(z.string().trim().min(1).max(2_000)).max(500),
  tagId: tagIdSchema,
});

export const removeTagFromPagesSchema = z.object({
  projectId: projectIdSchema,
  tagId: tagIdSchema,
});

export const loadPageTagsSchema = z.object({ projectId: projectIdSchema });
