"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import {
  readAnalyticsSurfaceFromHeaders,
  readConsentFromCookies,
  trackServerEvent,
} from "@/lib/analytics/server";
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
} from "@/lib/api/provider-service";
import { testProviderConnection } from "@/lib/api/provider-test-service";
import {
  cancelPendingGoogleOAuth,
  completePendingGooglePropertySelection,
  getPendingGoogleOAuthProvider,
} from "@/lib/providers/analytics/google-oauth-pending";
import {
  loadStoredGoogleProperties as loadStoredGooglePropertiesService,
  saveStoredGoogleProperty as saveStoredGooglePropertyService,
} from "@/lib/providers/analytics/google-stored-property";
import { projectSearchSyncSchema } from "@/lib/schemas/project";
import {
  disconnectProviderSchema,
  testProviderConnectionSchema,
  updateProviderCostSchema,
  updateProviderRateSchema,
} from "@/lib/schemas/provider";
import { saveSearchSyncSettings } from "@/lib/settings/search-sync-save";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateProviderViews,
} from "./_shared";

const googlePropertySelectionFields = {
  projectId: projectSearchSyncSchema.shape.projectId,
  property: z.string().trim().min(1).max(300),
  pace: projectSearchSyncSchema.shape.pace.optional(),
  retentionMonths: projectSearchSyncSchema.shape.retentionMonths.optional(),
};
const pairedSearchSyncSettings = (
  data: { pace?: string; retentionMonths?: number },
  ctx: z.RefinementCtx,
) => {
  if ((data.pace === undefined) === (data.retentionMonths === undefined)) return;
  ctx.addIssue({
    code: "custom",
    message: "Select both Search Console import depth and speed.",
    path: [data.pace === undefined ? "pace" : "retentionMonths"],
  });
};
const googlePropertySelectionSchema = z
  .object(googlePropertySelectionFields)
  .superRefine(pairedSearchSyncSettings);
const cancelGooglePropertySelectionSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
});
const storedGooglePropertyLoadSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  provider: z.enum(["gsc", "ga4"]),
});
const storedGooglePropertySaveSchema = z
  .object({ ...googlePropertySelectionFields, provider: z.enum(["gsc", "ga4"]) })
  .superRefine(pairedSearchSyncSettings);

const providerMutationSuccess = { ok: true } as const;

async function persistSelectedSearchSyncSettings(
  data: {
    pace?: "gentle" | "normal";
    projectId: string;
    retentionMonths?: 3 | 6 | 12 | 16;
  },
  onCommitted: (actor: Awaited<ReturnType<typeof getActionActor>>) => void,
) {
  if (data.pace === undefined || data.retentionMonths === undefined) return null;
  return saveSearchSyncSettings(
    {
      pace: data.pace,
      projectId: data.projectId,
      retentionMonths: data.retentionMonths,
    },
    onCommitted,
  );
}

export async function completeGooglePropertySelection(input: unknown) {
  const data = parseActionInput(googlePropertySelectionSchema, input);
  let committedActor: Parameters<typeof recordAppAction>[0] = null;
  try {
    if ((await getPendingGoogleOAuthProvider(data.projectId)) === "gsc") {
      await persistSelectedSearchSyncSettings(data, (actor) => {
        committedActor = actor;
      });
    }
    return await completePendingGooglePropertySelection(
      { projectId: data.projectId, property: data.property },
      (actor) => {
        committedActor = actor;
      },
    );
  } finally {
    if (committedActor) recordAppAction(committedActor);
  }
}

export async function cancelGooglePropertySelection(input: unknown) {
  const data = parseActionInput(cancelGooglePropertySelectionSchema, input);
  return cancelPendingGoogleOAuth(data.projectId, (actor) => recordAppAction(actor));
}

export async function disconnectGoogleSearchConsole(input: unknown) {
  const data = parseActionInput(cancelGooglePropertySelectionSchema, input);
  const { actor, scope } = await providerScope(data.projectId);
  const result = await disconnectProviderConnection(
    { projectId: data.projectId, providerId: "gsc" },
    scope,
  );
  let committed = !!result;
  try {
    await cancelPendingGoogleOAuth(data.projectId, () => {
      committed = true;
    });
  } finally {
    if (committed) recordAppAction(actor);
  }
  revalidateProviderViews();
  return result;
}

async function providerScope(projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", projectId, {
    type: "provider_connection",
  });
  return { actor, scope: { actorId: actor.id, projectId: project.id } };
}

export async function loadStoredGoogleProperties(input: unknown) {
  const data = parseActionInput(storedGooglePropertyLoadSchema, input);
  const { scope } = await providerScope(data.projectId);
  return loadStoredGooglePropertiesService({ projectId: scope.projectId, provider: data.provider });
}

export async function saveStoredGoogleProperty(input: unknown) {
  const data = parseActionInput(storedGooglePropertySaveSchema, input);
  const { actor, scope } = await providerScope(data.projectId);
  let committed = false;
  try {
    if (data.provider === "gsc")
      await persistSelectedSearchSyncSettings(data, () => {
        committed = true;
      });
    const result = await saveStoredGooglePropertyService(
      {
        actorId: scope.actorId,
        projectId: scope.projectId,
        property: data.property,
        provider: data.provider,
      },
      () => {
        committed = true;
      },
    );
    committed ||= result.status === "saved";
    if (result.status === "saved") revalidateProviderViews();
    return result;
  } finally {
    if (committed) recordAppAction(actor);
  }
}

export async function connectProvider(input: unknown) {
  const data = parseActionInput(connectProviderActionSchema, input);
  const { actor, scope } = await providerScope(data.projectId);
  await connectProviderConnection(data, scope, {}, () => recordAppAction(actor));
  revalidateProviderViews();
  const surface = await readAnalyticsSurfaceFromHeaders();
  if (surface) {
    await trackServerEvent("provider_connected", {
      consent: await readConsentFromCookies(),
      userId: scope.actorId ?? undefined,
      properties: { provider: data.providerId, surface },
    });
  }

  return providerMutationSuccess;
}

export async function testConnection(input: unknown) {
  const data = parseActionInput(testProviderConnectionSchema, input);
  const { actor, scope } = await providerScope(data.projectId);
  const result = await testProviderConnection(data, scope);
  if (result.ok) recordAppAction(actor);
  await trackServerEvent("provider_connection_tested", {
    consent: await readConsentFromCookies(),
    userId: scope.actorId ?? undefined,
    properties: {
      error_category: result.ok
        ? null
        : "rateLimited" in result && result.rateLimited
          ? "rate_limit"
          : "unknown",
      ok: result.ok,
      provider: data.providerId,
    },
  });

  return result;
}

export async function updateProviderSettings(input: unknown) {
  const data = parseActionInput(providerSettingsSchema, input);
  const { actor, scope } = await providerScope(data.projectId);
  await setProviderSettings(data, scope, () => recordAppAction(actor));
  revalidateProviderViews();

  return providerMutationSuccess;
}

export async function updateProviderCost(input: unknown) {
  const data = parseActionInput(updateProviderCostSchema, input);
  const { actor, scope } = await providerScope(data.projectId);
  await updateProviderCostConnection(data, scope);
  recordAppAction(actor);
  revalidateProviderViews();

  return providerMutationSuccess;
}

export async function updateProviderRate(input: unknown) {
  const data = parseActionInput(updateProviderRateSchema, input);
  const { actor, scope } = await providerScope(data.projectId);
  await updateProviderConnectionRate(data, scope);
  recordAppAction(actor);
  revalidateProviderViews();

  return providerMutationSuccess;
}

export async function disconnectProvider(input: unknown) {
  const data = parseActionInput(disconnectProviderSchema, input);
  const { actor, scope } = await providerScope(data.projectId);
  const result = await disconnectProviderConnection(data, scope);
  if (result) recordAppAction(actor);
  revalidateProviderViews();

  return result;
}
