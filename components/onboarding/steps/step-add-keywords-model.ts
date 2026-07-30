import { keywordLines } from "@/components/onboarding/onboarding-form-utils";
import { MAX_ONBOARDING_LOCATIONS } from "@/components/onboarding/onboarding-locations";
import {
  canonicalKeySchema,
  deviceSchema,
  KEYWORD_IMPORT_LIMIT_MESSAGE,
  KEYWORD_IMPORT_MAX,
  KEYWORD_TEXT_MAX,
} from "@/lib/schemas/keyword";
import { DEFAULT_SERP_DEVICE } from "@/lib/serp/markets";
import { z } from "zod";

type KeywordPreview = {
  duplicateLines: number;
  longLines: number;
  uniqueKeywords: string[];
};

export function keywordDraftPreview(value: string): KeywordPreview {
  const seen = new Set<string>();
  const uniqueKeywords: string[] = [];
  let duplicateLines = 0;
  let longLines = 0;
  for (const line of keywordLines(value)) {
    if (line.length > KEYWORD_TEXT_MAX) longLines += 1;
    const key = line.toLowerCase();
    if (seen.has(key)) duplicateLines += 1;
    else {
      seen.add(key);
      uniqueKeywords.push(line);
    }
  }
  return { duplicateLines, longLines, uniqueKeywords };
}

export function keywordDraftMessage(preview: KeywordPreview) {
  const keyword = preview.uniqueKeywords.length === 1 ? "keyword" : "keywords";
  const duplicate = preview.duplicateLines === 1 ? "line" : "lines";
  const duplicateText =
    preview.duplicateLines > 0
      ? ` \u00b7 ${preview.duplicateLines} duplicate ${duplicate} ignored`
      : "";
  return `${preview.uniqueKeywords.length} unique ${keyword}${duplicateText}`;
}

export function longKeywordMessage(count: number) {
  const line = count === 1 ? "line exceeds" : "lines exceed";
  return `${count} ${line} the ${KEYWORD_TEXT_MAX}-character keyword limit.`;
}

const keywordDraftSchema = z.string().superRefine((value, ctx) => {
  const preview = keywordDraftPreview(value);
  if (preview.uniqueKeywords.length === 0)
    ctx.addIssue({ code: "custom", message: "Add at least one keyword." });
  if (preview.longLines > 0)
    ctx.addIssue({ code: "custom", message: longKeywordMessage(preview.longLines) });
  if (preview.uniqueKeywords.length > KEYWORD_IMPORT_MAX)
    ctx.addIssue({ code: "custom", message: KEYWORD_IMPORT_LIMIT_MESSAGE });
});

export const addKeywordsFormSchema = z.object({
  device: deviceSchema.default(DEFAULT_SERP_DEVICE),
  devices: z.array(deviceSchema).min(1),
  keywords: keywordDraftSchema,
  locations: z.array(canonicalKeySchema).min(1).max(MAX_ONBOARDING_LOCATIONS),
  projectId: z.string().trim().min(1).max(120),
});

export type AddKeywordsForm = z.infer<typeof addKeywordsFormSchema>;
