import "server-only";

import { setPrimaryProviderSchema, testProviderConnectionSchema } from "@/lib/schemas/provider";
import type { ApiContext } from "./context";
import { paginateArray } from "./pagination";
import { listProviderCategories } from "./provider-list";
import {
  connectProviderActionSchema,
  connectProviderConnection,
  disconnectProviderConnection,
  providerSettingsSchema,
  setProviderSettings,
  testProviderConnection,
} from "./provider-service";
import { requireApiPublicId } from "./public-id";
import { listResponse, resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

function providerConnectionResource(connection: {
  costPerCheckCents: unknown;
  enabled: boolean;
  kind: string;
  priority: number;
  provider: string;
  publicId: string | null;
  status: string;
}) {
  return {
    connectionId: requireApiPublicId(connection.publicId ?? "", "conn"),
    costPerCheckCents: connection.costPerCheckCents,
    enabled: connection.enabled,
    id: connection.provider,
    kind: connection.kind,
    priority: connection.priority,
    provider: connection.provider,
    status: connection.status,
  };
}

function providerContext(ctx: ApiContext) {
  return {
    actorId: null,
    projectId: ctx.auth.project.id,
    projectPublicId: ctx.auth.project.publicId,
  };
}

function providersFromCategories(categories: Awaited<ReturnType<typeof listProviderCategories>>) {
  return categories.flatMap((category) =>
    category.providers.map((provider) => ({
      ...provider,
      ...(provider.connectionId
        ? { connectionId: requireApiPublicId(provider.connectionId, "conn") }
        : {}),
      categoryId: category.id,
      categoryTitle: category.title,
    })),
  );
}

export async function listProviders(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const categories = await runDomain(() => listProviderCategories(ctx.auth.project.id));
  const { nextCursor, page } = paginateArray(ctx.url, providersFromCategories(categories));

  return listResponse(page.map(snakeizeKeys), nextCursor, { headers: ctx.headers });
}

export async function connectProviderForProject(
  ctx: ApiContext,
  projectId: string,
  providerId: string,
) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const input = parseApiInput(connectProviderActionSchema, {
    ...objectBody(body),
    project_id: projectId,
    provider_id: providerId,
  });
  const provider = await runDomain(() => connectProviderConnection(input, providerContext(ctx)));

  return resourceResponse(snakeizeKeys(providerConnectionResource(provider)), {
    headers: ctx.headers,
    status: 201,
  });
}

export async function testProviderForProject(
  ctx: ApiContext,
  projectId: string,
  providerId: string,
) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const input = parseApiInput(testProviderConnectionSchema, {
    ...objectBody(body),
    project_id: projectId,
    provider_id: providerId,
  });
  const result = await runDomain(() => testProviderConnection(input, providerContext(ctx)));

  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}

export async function updateProviderSettings(
  ctx: ApiContext,
  projectId: string,
  providerId: string,
) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const input = parseApiInput(providerSettingsSchema, {
    ...objectBody(body),
    project_id: projectId,
    provider_id: providerId,
  });
  const provider = await runDomain(() => setProviderSettings(input, providerContext(ctx)));

  return resourceResponse(snakeizeKeys(providerConnectionResource(provider)), {
    headers: ctx.headers,
  });
}

export async function disconnectProviderForProject(
  ctx: ApiContext,
  projectId: string,
  providerId: string,
) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const input = parseApiInput(setPrimaryProviderSchema, {
    project_id: projectId,
    provider_id: providerId,
  });
  const result = await runDomain(() => disconnectProviderConnection(input, providerContext(ctx)));

  return resourceResponse(snakeizeKeys(result ?? { ok: false }), { headers: ctx.headers });
}
