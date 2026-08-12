"use server";

import {
  updateProviderConnectionRate,
  updateProviderCostConnection,
} from "@/lib/api/provider-rate-service";
import {
  connectProviderActionSchema,
  connectProviderConnection,
  disconnectProviderConnection,
  providerSettingsSchema,
  setProviderSettings,
  testProviderConnection,
} from "@/lib/api/provider-service";
import { completePendingGooglePropertySelection } from "@/lib/providers/analytics/google-oauth-pending";
import {
  loadStoredGoogleProperties as loadStoredGooglePropertiesService,
  saveStoredGoogleProperty as saveStoredGooglePropertyService,
} from "@/lib/providers/analytics/google-stored-property";
import {
  providerConnectionRefSchema,
  testProviderConnectionSchema,
  updateProviderCostSchema,
  updateProviderRateSchema,
} from "@/lib/schemas/provider";
import { startTrafficSyncWorkflow } from "@/lib/temporal/traffic-client";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateProviderViews,
} from "./_shared";

const googlePropertySelectionSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  property: z.string().trim().min(1).max(300),
});
const storedGooglePropertyLoadSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  provider: z.enum(["gsc", "ga4"]),
});
const storedGooglePropertySaveSchema = storedGooglePropertyLoadSchema.extend({
  property: z.string().trim().min(1).max(300),
});

const providerMutationSuccess = { ok: true } as const;

export async function completeGooglePropertySelection(input: unknown) {
  return completePendingGooglePropertySelection(
    parseActionInput(googlePropertySelectionSchema, input),
  );
}

async function providerScope(projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", projectId, {
    type: "provider_connection",
  });
  return { actorId: actor.id, projectId: project.id };
}

export async function loadStoredGoogleProperties(input: unknown) {
  const data = parseActionInput(storedGooglePropertyLoadSchema, input);
  const scope = await providerScope(data.projectId);
  return loadStoredGooglePropertiesService({ projectId: scope.projectId, provider: data.provider });
}

export async function saveStoredGoogleProperty(input: unknown) {
  const data = parseActionInput(storedGooglePropertySaveSchema, input);
  const scope = await providerScope(data.projectId);
  const result = await saveStoredGooglePropertyService({
    actorId: scope.actorId,
    projectId: scope.projectId,
    property: data.property,
    provider: data.provider,
  });
  if (result.status === "saved") revalidateProviderViews();
  return result;
}

export async function connectProvider(input: unknown) {
  const data = parseActionInput(connectProviderActionSchema, input);
  const scope = await providerScope(data.projectId);
  const connection = await connectProviderConnection(data, scope);
  revalidateProviderViews();

  if (connection.kind === "analytics" && connection.enabled && connection.status === "connected") {
    void startTrafficSyncWorkflow()
      .then(revalidateProviderViews)
      .catch((error: unknown) => {
        console.error("[traffic] initial provider sync could not be queued", {
          error: error instanceof Error ? error.message : "Unknown traffic scheduler error.",
          projectId: scope.projectId,
          provider: connection.provider,
        });
      });
  }

  return providerMutationSuccess;
}

export async function testConnection(input: unknown) {
  const data = parseActionInput(testProviderConnectionSchema, input);
  return testProviderConnection(data, await providerScope(data.projectId));
}

export async function updateProviderSettings(input: unknown) {
  const data = parseActionInput(providerSettingsSchema, input);
  await setProviderSettings(data, await providerScope(data.projectId));
  revalidateProviderViews();

  return providerMutationSuccess;
}

export async function updateProviderCost(input: unknown) {
  const data = parseActionInput(updateProviderCostSchema, input);
  await updateProviderCostConnection(data, await providerScope(data.projectId));
  revalidateProviderViews();

  return providerMutationSuccess;
}

export async function updateProviderRate(input: unknown) {
  const data = parseActionInput(updateProviderRateSchema, input);
  await updateProviderConnectionRate(data, await providerScope(data.projectId));
  revalidateProviderViews();

  return providerMutationSuccess;
}

export async function disconnectProvider(input: unknown) {
  const data = parseActionInput(providerConnectionRefSchema, input);
  const result = await disconnectProviderConnection(data, await providerScope(data.projectId));
  revalidateProviderViews();

  return result;
}
