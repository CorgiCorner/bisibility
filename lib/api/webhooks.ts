import "server-only";

import { assertWebhookUrlAllowed } from "@/lib/alerts/webhook-guard";
import type { ApiContext } from "./context";
import { notFound } from "./context";
import { webhookEndpointResource } from "./resources";
import { listResponse, resourceResponse } from "./responses";
import { webhookCreateSchema, webhookPatchSchema } from "./schemas";
import { objectBody, parseApiInput, readJsonBody, runDomain, scopedProject } from "./surface";
import {
  createWebhookEndpointRecord,
  deleteWebhookEndpointRecord,
  listWebhookEndpoints,
  updateWebhookEndpointRecord,
} from "./webhook-service";

export async function listWebhooks(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const endpoints = await listWebhookEndpoints(ctx.auth.project.id);
  return listResponse(endpoints.map(webhookEndpointResource), null, { headers: ctx.headers });
}

export async function createWebhook(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const data = parseApiInput(webhookCreateSchema, objectBody(body));
  await runDomain(() => assertWebhookUrlAllowed(data.url));
  const endpoint = await createWebhookEndpointRecord(
    {
      description: data.description,
      enabled: data.enabled,
      hmacSecret: data.hmacSecret,
      url: data.url,
    },
    { actorId: ctx.actorId ?? null, projectId: ctx.auth.project.id },
  );

  return resourceResponse(webhookEndpointResource(endpoint), {
    headers: ctx.headers,
    status: 201,
  });
}

export async function updateWebhook(ctx: ApiContext, projectId: string, endpointId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const data = parseApiInput(webhookPatchSchema, objectBody(body));
  if (data.url !== undefined) {
    await runDomain(() => assertWebhookUrlAllowed(data.url as string));
  }
  const endpoint = await updateWebhookEndpointRecord(endpointId, data, {
    actorId: ctx.actorId ?? null,
    projectId: ctx.auth.project.id,
  });
  if (!endpoint) {
    return notFound(ctx, "Webhook endpoint not found.");
  }

  return resourceResponse(webhookEndpointResource(endpoint), { headers: ctx.headers });
}

export async function deleteWebhook(ctx: ApiContext, projectId: string, endpointId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const endpoint = await deleteWebhookEndpointRecord(endpointId, {
    actorId: ctx.actorId ?? null,
    projectId: ctx.auth.project.id,
  });
  if (!endpoint) {
    return notFound(ctx, "Webhook endpoint not found.");
  }

  return resourceResponse(webhookEndpointResource(endpoint), { headers: ctx.headers });
}
