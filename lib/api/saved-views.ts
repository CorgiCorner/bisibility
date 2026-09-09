import "server-only";

import { listSavedViewsFor } from "@/lib/queries/saved-views";
import {
  createProjectSavedViewSchema,
  inferSavedViewSurface,
  type SavedViewResource,
  savedViewSurfaceSchema,
} from "@/lib/saved-views/model";
import { createSavedViewFor, deleteSavedViewFor } from "@/lib/saved-views/service";
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
      ? await runDomain(() => listSavedViewsFor(requireApiActor(ctx), projectId, "competitors"))
      : await runDomain(() => listSavedViewsFor(requireApiActor(ctx), projectId, "keywords"));
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
  const view = await runDomain(() => createSavedViewFor(input, apiMutationContext(ctx)));

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
    deleteSavedViewFor(
      { projectId: projectId ?? ctx.auth.project.publicId, viewId },
      apiMutationContext(ctx),
    ),
  );

  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}
