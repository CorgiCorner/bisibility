"use server";

import {
  readAnalyticsSurfaceFromHeaders,
  readConsentFromCookies,
  trackServerEvent,
} from "@/lib/analytics/server";
import { type AddKeywordsMatrixInput, addKeywordsMatrixSchema } from "@/lib/schemas/keyword";
import { getActionActor, parseActionInput } from "./_shared";
import { addKeywordsMatrix as addKeywordsMatrixImpl } from "./keyword-matrix";

export async function addKeywordsMatrixWithAnalytics(input: unknown) {
  const data = parseActionInput(addKeywordsMatrixSchema, input);
  const actor = await getActionActor();
  const result = await addKeywordsMatrixImpl(data);
  await emitMatrixKeywordsAdded({ actorId: actor.id, data, result });
  return result;
}

export async function emitMatrixKeywordsAdded(input: {
  actorId: string;
  data: AddKeywordsMatrixInput;
  result: { created: number };
}): Promise<void> {
  const surface = await readAnalyticsSurfaceFromHeaders();
  if (!surface || input.result.created === 0) return;
  await trackServerEvent("keywords_added", {
    consent: await readConsentFromCookies(),
    distinctId: input.actorId,
    properties: {
      keyword_count: new Set(input.data.keywords.map((keyword) => keyword.toLocaleLowerCase()))
        .size,
      market_count: new Set(input.data.locations.map((location) => JSON.stringify(location))).size,
      source: "manual",
      surface,
    },
  });
}
