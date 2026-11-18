"use server";

import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { getAiResearchPage } from "@/lib/actions/ai-research";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { loadModelPlaygroundContext } from "@/lib/ai-research/model-playground-context";
import { canWriteAiTracking } from "@/lib/ai-tracking/projections/schedule-list";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction, hasProjectCapability } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { modelPlaygroundCatalogRequestSchema } from "@/lib/model-playground/catalog-request";
import { launchModelPlayground } from "@/lib/model-playground/launch";
import { loadNativeModelComposer } from "@/lib/model-playground/page";
import { ModelAdmissionRefusal } from "@/lib/model-playground/payment";
import { previewModelPlayground } from "@/lib/model-playground/preview";
import { readModelPlayground } from "@/lib/model-playground/read";
import { modelPlaygroundRuntime, nativeComposer } from "@/lib/model-playground/server";
import { z } from "zod";

function nativeRefusal(error: unknown) {
  if (!(error instanceof ModelAdmissionRefusal))
    console.error("[model-playground] unexpected action failure", {
      name: error instanceof Error ? error.name : "UnknownError",
      frames:
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .filter((line) => /^\s+at /.test(line))
              .slice(0, 6)
          : undefined,
      code:
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string" &&
        /^P\d{4}$/.test(error.code)
          ? error.code
          : undefined,
      validation:
        error instanceof z.ZodError
          ? error.issues.map(({ code, path }) => ({ code, path }))
          : undefined,
    });
  return error instanceof ModelAdmissionRefusal
    ? {
        kind: "refused" as const,
        reason: error.reason,
        message: "Check access, settings and connections, then refresh the estimate.",
      }
    : {
        kind: "uncertain" as const,
        message: "The request could not be completed. Refresh to check its status.",
      };
}

export async function getModelPlaygroundCatalogAction(projectId: string, request: unknown) {
  const runtime = modelPlaygroundRuntime(projectId);
  let access: Awaited<ReturnType<typeof runtime.authorize>>;
  try {
    access = await runtime.authorize("read");
  } catch {
    return { kind: "access_denied" as const, message: "You cannot read this project." };
  }
  try {
    if (!nativeComposer.enabled)
      return { kind: "feature_disabled" as const, message: "Model Playground is not enabled." };
    const parsed = modelPlaygroundCatalogRequestSchema.safeParse(request);
    if (!parsed.success)
      return { kind: "invalid_request" as const, message: "Invalid catalog request." };
    const resolved = await runtime.resolve(runtime.db, access.projectId, parsed.data);
    return { kind: "catalog" as const, catalog: resolved.catalog };
  } catch (error) {
    return nativeRefusal(error);
  }
}

export async function previewModelPlaygroundAction(
  projectId: string,
  request: { revision: string; input: unknown },
) {
  const runtime = modelPlaygroundRuntime(projectId);
  try {
    await runtime.authorize("create");
  } catch {
    return { kind: "access_denied" as const, message: "You cannot run this project." };
  }
  try {
    if (!nativeComposer.enabled)
      return { kind: "feature_disabled" as const, message: "Model Playground is not enabled." };
    return { kind: "preview" as const, quote: await previewModelPlayground(runtime, request) };
  } catch (error) {
    return nativeRefusal(error);
  }
}

export async function launchModelPlaygroundAction(projectId: string, request: unknown) {
  const runtime = modelPlaygroundRuntime(projectId);
  try {
    await runtime.authorize("create");
    if (!nativeComposer.enabled)
      return { kind: "feature_disabled" as const, message: "Model Playground is not enabled." };
  } catch {
    return { kind: "access_denied" as const, message: "You cannot run this project." };
  }
  const actor = await getActionActor();
  return launchModelPlayground(runtime, request, () => recordAppAction(actor));
}

export async function readModelPlaygroundAction(projectId: string, runId: string) {
  return readModelPlayground(modelPlaygroundRuntime(projectId), runId);
}

export async function getModelPlaygroundPage(projectId: string) {
  if (nativeComposer.enabled) {
    const actor = await getActionActor();
    const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
    const context = await loadModelPlaygroundContext(project.id);
    const canRun =
      hasProjectCapability(getProjectRole(actor, project.id), "assistant.use") &&
      !isProjectReadOnly(project.writeMode);
    return {
      ...context,
      canRun,
      canTrack: false,
      catalog: undefined,
      catalogError: undefined,
      catalogFailure: undefined,
      engineOptions: [],
      supportingProviders: [],
      domain: project.domain ?? "",
      nativeComposer: {
        ...(await loadNativeModelComposer(project, modelPlaygroundRuntime(projectId))),
        canConnect: canProjectAction(
          getProjectRole(actor, project.id),
          "manage",
          "provider_connection",
        ),
      },
    };
  }
  const research = await getAiResearchPage(projectId, "prompt");
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  const context = await loadModelPlaygroundContext(project.id);
  return {
    ...research,
    ...context,
    nativeComposer: undefined,
    canTrack: canWriteAiTracking(getProjectRole(actor, project.id), project.writeMode),
  };
}
