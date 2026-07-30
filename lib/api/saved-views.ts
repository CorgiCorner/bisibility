import "server-only";

import { createSavedView, deleteSavedView } from "@/lib/actions/saved-views";
import { listSavedViews } from "@/lib/queries/saved-views";
import {
  createProjectSavedViewSchema,
  inferSavedViewSurface,
  type SavedViewResource,
  savedViewSurfaceSchema,
} from "@/lib/saved-views/model";
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

function savedViewApiResource(view: SavedViewResource) {
  const { createdById: _createdById, ...resource } = view as SavedViewResource & {
    createdById?: string;
  };
  return resource;
}

export async function listProjectSavedViews(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const surface = savedViewSurfaceSchema.parse(ctx.url.searchParams.get("surface") ?? "keywords");
  const views: SavedViewResource[] =
    surface === "competitors"
      ? await runDomain(() => listSavedViews(projectId, "competitors"))
      : await runDomain(() => listSavedViews(projectId, "keywords"));
  const { nextCursor, page } = paginateArray(ctx.url, views);

  return listResponse(page.map(savedViewApiResource).map(snakeizeKeys), nextCursor, {
    headers: ctx.headers,
  });
}

export async function createProjectSavedView(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const object = objectBody(body);
  const config =
    object.config && typeof object.config === "object" && !Array.isArray(object.config)
      ? (object.config as Record<string, unknown>)
      : null;
  const requestedSurface = inferSavedViewSurface(config, object.surface);
  const input = parseApiInput(createProjectSavedViewSchema, {
    ...object,
    config: config
      ? { ...config, surface: requestedSurface, version: config.version ?? 1 }
      : object.config,
    project_id: projectId,
  });
  const view = await runDomain(() => createSavedView(input));

  return resourceResponse(snakeizeKeys(savedViewApiResource(view)), {
    headers: ctx.headers,
    status: 201,
  });
}

export async function deleteProjectSavedView(ctx: ApiContext, viewId: string, projectId?: string) {
  if (projectId) {
    const scoped = scopedProject(ctx, projectId);
    if (scoped) return scoped;
  }

  const result = await runDomain(() =>
    deleteSavedView({ projectId: projectId ?? ctx.auth.project.id, viewId }),
  );

  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}
