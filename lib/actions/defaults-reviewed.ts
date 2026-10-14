"use server";
import { AuthorizationError } from "@/lib/auth/authorize";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { previewDefaultsHost, saveDefaultsHost } from "@/lib/measurement-settings/host/defaults";
import type { DefaultsHostContext } from "@/lib/measurement-settings/host/defaults-authority";
import { SettingsHostError } from "@/lib/measurement-settings/host/errors";
import { getOnboardingNextCheckAt } from "@/lib/queries/onboarding";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import type { DefaultsRequest } from "@/lib/settings/reviewed-defaults-contract";
import { DefaultsReviewRequiredError } from "@/lib/settings/reviewed-defaults-contract";
import { ZodError } from "zod";
import { getActionActor, revalidateSettingsViews } from "./_shared";
export async function previewDefaultSettings(input: unknown) {
  const actor = await getActionActor();
  return previewDefaultsHost({ actor }, { kind: "form", values: input });
}
export async function saveReviewedDefaultSettings(input: unknown, review: unknown) {
  return saveFor(input, review, "settings.defaults.update");
}
export async function previewProjectDefaultSettings(input: unknown) {
  const actor = await getActionActor();
  return previewDefaultsHost(
    { actor, action: "project_defaults.update" },
    { kind: "form", values: input },
  );
}
export async function saveReviewedProjectDefaults(input: unknown, review: unknown) {
  return saveFor(input, review, "project_defaults.update");
}
function frequencyRequest(input: unknown): DefaultsRequest {
  const { projectId, frequency, cronExpression, timezone, jitterMinutes, serpDepth } =
    projectDefaultsSchema.parse(input);
  return {
    kind: "patch",
    values: { projectId, frequency, cronExpression, timezone, jitterMinutes, serpDepth },
  };
}
export async function previewFrequencyDefaults(input: unknown) {
  const actor = await getActionActor();
  return previewDefaultsHost(
    { actor, action: "settings.rank_check_frequency.update" },
    frequencyRequest(input),
  );
}
export async function saveReviewedFrequencyDefaults(input: unknown, review: unknown) {
  return saveFor(input, review, "settings.rank_check_frequency.update");
}
async function saveFor(input: unknown, review: unknown, action: DefaultsHostContext["action"]) {
  const actor = await getActionActor();
  let result: Awaited<ReturnType<typeof saveDefaultsHost>>;
  try {
    result = await saveDefaultsHost(
      { actor, action },
      action === "settings.rank_check_frequency.update"
        ? frequencyRequest(input)
        : { kind: "form", values: input },
      review,
    );
  } catch (error) {
    let code: string;
    if (error instanceof DefaultsReviewRequiredError) code = "preview_required";
    else if (error instanceof SettingsHostError) code = error.code;
    else if (error instanceof PreviewTokenError)
      code = error.code === "expired" ? "preview_expired" : "preview_mismatch";
    else if (error instanceof AuthorizationError || error instanceof ProjectReadOnlyError)
      return { kind: "unconfirmed" as const, code: "forbidden", nextCheckAt: null };
    else if (error instanceof ZodError) code = "invalid_settings";
    else throw error; // A transport/infrastructure error may have committed. Recover the exact command.
    return { kind: "not_saved" as const, code, nextCheckAt: null };
  }
  // A post-commit read failure remains ambiguous to the caller; it must retain the exact receipt key.
  revalidateSettingsViews();
  const next = await getOnboardingNextCheckAt(result.value.projectId);
  return { ...result.value, nextCheckAt: next?.toISOString() ?? null, kind: "saved" as const };
}
