import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import { addManagedCompetitorFor, removeManagedCompetitorFor } from "@/lib/competitors/service";
import type { ManagedCompetitor } from "@/lib/competitors/types";
import { addManagedCompetitorSchema, removeManagedCompetitorSchema } from "@/lib/competitors/types";
import { getCompetitorsApiViewFor } from "@/lib/queries/competitors";
import { historyExportReportOptions } from "@/lib/rank-history/export-host";
import { competitorMarketApiView } from "./competitor-market-view";
import { type ApiContext, apiMutationContext, requireApiActor } from "./context";
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

function publicCompetitor({ domain, id, label }: ManagedCompetitor) {
  return { domain, id, label };
}

export async function listProjectCompetitors(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const kind = ctx.origin.credentialKind;
  if (kind !== "project_key" && kind !== "personal_token" && kind !== "oauth_client")
    throw new AuthorizationError("forbidden");
  const actor = requireApiActor(ctx);
  const report = historyExportReportOptions({
    actor,
    transport: kind === "project_key" ? "project_key" : "personal_token",
    credentialId: ctx.origin.credentialId,
    credential: { kind, id: ctx.origin.credentialId },
  });
  const view = await runDomain(() => getCompetitorsApiViewFor(actor, projectId, report));
  const { nextCursor, page } = paginateArray(ctx.url, view.managedCompetitors);

  return listResponse(page.map(publicCompetitor).map(snakeizeKeys), nextCursor, {
    headers: ctx.headers,
    meta: snakeizeKeys({
      markets: view.markets.map(competitorMarketApiView),
      suggestions: view.suggestions.map(({ domain, overlap }) => ({ domain, overlap })),
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
  const competitor = await runDomain(() => addManagedCompetitorFor(input, apiMutationContext(ctx)));

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
    project_id: projectId ?? ctx.auth.project.publicId,
  });
  const result = await runDomain(() => removeManagedCompetitorFor(input, apiMutationContext(ctx)));

  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}
