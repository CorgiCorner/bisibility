import "server-only";
import { ProviderCallError } from "@/lib/providers/call-error";
import type { ProviderCredentials } from "@/lib/providers/types";
import { z } from "zod";
import { AI_REQUEST_BUDGET_MS } from "./deadline";
import { safeCitationUrl } from "./normalize";
import {
  type PromptResearchInput,
  promptResearchSchema,
  researchMatchType,
} from "./prompt-research-schema";
import { aiProviderRequest, VISIBILITY_PATH } from "./provider";
import { boundAiRow } from "./row-budget";
import type { AiResearchRow } from "./types";

const datasetQuestion = z.object({
  question: z.string().nullish(),
  answer: z.string().nullish(),
  model_name: z.string().nullish(),
  datetime: z.string().nullish(),
  date: z.string().nullish(),
  ai_search_volume: z.number().finite().nonnegative().nullish(),
  sources: z.array(z.object({ url: z.string(), title: z.string().nullish() })).nullish(),
});
export function researchQuestionRow(value: unknown): AiResearchRow[] {
  const item = datasetQuestion.parse(value);
  if (!item.question?.trim()) return [];
  const seen = new Set<string>();
  const citations = (item.sources ?? []).flatMap((source) => {
    const url = safeCitationUrl(source.url);
    if (!url || url.length > 500 || seen.has(url)) return [];
    seen.add(url);
    return [
      { url, title: (source.title ?? new URL(url).hostname).slice(0, 200), targetDomain: false },
    ];
  });
  return [
    boundAiRow({
      prompt: item.question.trim().slice(0, 500),
      answer: item.answer ?? "",
      model: (item.model_name ?? "chat_gpt").slice(0, 120),
      observedAt: (item.datetime ?? item.date)?.slice(0, 64) ?? null,
      datasetVolume: item.ai_search_volume ?? 0,
      // Project-specific signals are derived from retained evidence on every read.
      brandMentioned: false,
      domainCited: false,
      citations,
      contentTruncated:
        item.question.trim().length > 500 || (item.sources?.length ?? 0) > citations.length,
    }),
  ];
}
export async function fetchResearchQuestions(
  credentials: ProviderCredentials,
  value: PromptResearchInput,
  tag: string,
  deadlineAt = Date.now() + AI_REQUEST_BUDGET_MS,
  onDispatch?: () => void,
) {
  const input = promptResearchSchema.parse(value);
  const result = await aiProviderRequest(
    credentials,
    VISIBILITY_PATH,
    {
      target: [
        {
          keyword: input.keyword,
          search_scope: ["question", "answer"],
          match_type: researchMatchType(input.keyword),
        },
      ],
      platform: input.platform,
      location_code: input.location_code,
      language_code: input.language_code,
      order_by: ["ai_search_volume,desc"],
      limit: input.limit,
      tag,
    },
    deadlineAt,
    onDispatch,
  );
  if (!result.result || !Array.isArray(result.result.items))
    throw new ProviderCallError("Prompt Research response is incomplete.", result.costCents);
  try {
    return {
      ...result,
      rows: result.result.items.slice(0, input.limit).flatMap(researchQuestionRow),
      totalAvailable: result.result.total_count ?? null,
    };
  } catch {
    throw new ProviderCallError(
      "Prompt Research response could not be normalized.",
      result.costCents,
    );
  }
}
