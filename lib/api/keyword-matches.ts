import "server-only";

import { findKeywordMatches, type KeywordMatchRow } from "@/lib/queries/keyword-matches";
import type { ApiContext } from "./context";
import { dataResponse } from "./responses";
import { keywordMatchRequestSchema } from "./schemas";
import { parseApiInput, readJsonBody, scopedProject } from "./surface";

function keywordMatchResource(match: KeywordMatchRow) {
  return {
    keyword_id: match.keywordId,
    latest_position: match.latestPosition,
    matched_text: match.matchedText,
    market: {
      country_code: match.countryCode,
      device: match.device,
      language_code: match.languageCode,
      language_label: match.languageLabel,
      location: match.location,
      location_key: match.locationKey,
    },
    previous_position: match.previousPosition,
    ranking_url: match.rankingUrl,
    text: match.text,
  };
}

export async function matchProjectKeywords(ctx: ApiContext, projectId: string) {
  const forbidden = scopedProject(ctx, projectId);
  if (forbidden) {
    return forbidden;
  }

  const body = parseApiInput(keywordMatchRequestSchema, await readJsonBody(ctx));
  const result = await findKeywordMatches(ctx.auth.project.id, body.texts);

  return dataResponse(result.matches.map(keywordMatchResource), {
    headers: ctx.headers,
    meta: { truncated_texts: result.truncatedTexts },
  });
}
