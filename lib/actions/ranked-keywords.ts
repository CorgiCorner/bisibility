"use server";

import { isPublicIdOfType } from "@/lib/db/public-id";
import { fetchRankedKeywords } from "@/lib/ranked-keywords/service";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const rankedKeywordsSchema = z.object({
  connectionId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => isPublicIdOfType(value, "conn"))
    .optional(),
  offset: z.coerce.number().int().min(0).max(900).multipleOf(100).default(0),
  projectId: z.string().trim().min(1).max(120),
});

export type FetchRankedKeywordSuggestionsInput = {
  connectionId?: string;
  offset?: number;
  projectId: string;
};

export async function fetchRankedKeywordSuggestions(input: unknown) {
  const data = parseActionInput(rankedKeywordsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "project" });
  const result = await fetchRankedKeywords({
    actorId: actor.id,
    connectionId: data.connectionId,
    limit: 100,
    offset: data.offset,
    projectId: project.id,
  });
  if (!result.ok) return { reason: result.reason } as const;
  return result;
}
