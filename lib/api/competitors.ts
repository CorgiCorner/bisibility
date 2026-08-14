import "server-only";

import { addManagedCompetitor, removeManagedCompetitor } from "@/lib/actions/competitors";
import type { CompetitorObservation } from "@/lib/competitors/types";
import { addManagedCompetitorSchema, removeManagedCompetitorSchema } from "@/lib/competitors/types";
import { getCompetitorsApiView } from "@/lib/queries/competitors";
import type { ApiContext } from "./context";
import { paginateArray } from "./pagination";
import { listResponse, resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

function publicObservation({
  completed,
  id,
  keyword,
  ranked,
  ranks,
  tags,
}: CompetitorObservation): Omit<CompetitorObservation, "volume"> {
  return { completed, id, keyword, ranked, ranks, tags };
}

export async function listProjectCompetitors(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const view = await runDomain(() => getCompetitorsApiView(projectId));
  const { nextCursor, page } = paginateArray(ctx.url, view.managedCompetitors);

  return listResponse(page.map(snakeizeKeys), nextCursor, {
    headers: ctx.headers,
    meta: snakeizeKeys({
      markets: view.markets.map((market) => ({
        ...market,
        country: market.location,
        device: market.device === "mobile" ? "Mobile" : "Desktop",
        engine: "Google",
        observations: market.observations.map(publicObservation),
      })),
      suggestions: view.suggestions,
    }) as Record<string, unknown>,
  });
}

export async function addProjectCompetitor(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const input = parseApiInput(addManagedCompetitorSchema, {
    ...objectBody(body),
    project_id: projectId,
  });
  const competitor = await runDomain(() => addManagedCompetitor(input));

  return resourceResponse(snakeizeKeys(competitor), { headers: ctx.headers, status: 201 });
}

export async function removeProjectCompetitor(
  ctx: ApiContext,
  competitorId: string,
  projectId?: string,
) {
  if (projectId) {
    const scoped = scopedProject(ctx, projectId);
    if (scoped) return scoped;
  }

  const input = parseApiInput(removeManagedCompetitorSchema, {
    competitor_id: competitorId,
    project_id: projectId ?? ctx.auth.project.id,
  });
  const result = await runDomain(() => removeManagedCompetitor(input));

  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}
