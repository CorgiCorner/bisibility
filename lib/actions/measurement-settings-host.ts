"use server";
import type { ActionPaymentFailure } from "@/lib/action-payment/contract";
import { ActionPaymentError } from "@/lib/action-payment/token";
import { AuthorizationError } from "@/lib/auth/authorize";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { SettingsHostError } from "@/lib/measurement-settings/host/errors";
import { launchMeasurementSettingsHost } from "@/lib/measurement-settings/host/launch";
import { previewMeasurementSettingsHost } from "@/lib/measurement-settings/host/preview";
import { readMeasurementSettingsHost } from "@/lib/measurement-settings/host/read";
import { saveMeasurementIntentHost } from "@/lib/measurement-settings/host/save-intent";
import { saveMeasurementScheduleHost } from "@/lib/measurement-settings/host/save-schedule";
import type {
  IntentResult,
  MeasurementQuote,
  PaidLaunchCommand,
  PreviewRequest,
  ReadResult,
  ScheduleIntentCommand,
  SettingsIntentCommand,
} from "@/lib/measurement-settings/ui-contracts";
import { budgetFailureResult } from "@/lib/rank-check/budget-failure";
import { LaunchRankCheckRunError, SampleProjectError } from "@/lib/rank-check/runs/launch-types";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { ZodError } from "zod";
import { getActionActor } from "./_shared";
import type { LaunchRankCheckRunActionResult } from "./rank-check-run-launch-result";

function paymentLaunchCode(
  reason: ActionPaymentFailure,
): "payment_already_executed" | "payment_unavailable" | null {
  switch (reason) {
    case "payment_already_executed":
      return "payment_already_executed";
    case "payment_quote_required":
    case "payment_unavailable":
      return "payment_unavailable";
    case "payment_quote_changed":
    case "payment_quote_expired":
      return null;
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

export async function readMeasurementSettingsAction(
  projectId: string,
  scheduleId: string | null = null,
) {
  return readMeasurementSettingsHost({ actor: await getActionActor() }, projectId, scheduleId);
}
export async function previewMeasurementSettingsAction(
  input: PreviewRequest,
): Promise<ReadResult<MeasurementQuote>> {
  const actor = await getActionActor();
  try {
    return { kind: "ready", value: await previewMeasurementSettingsHost({ actor }, input) };
  } catch (error) {
    if (error instanceof SettingsHostError)
      return { kind: error.code === "settings_conflict" ? "conflict" : "error" };
    if (
      error instanceof ZodError ||
      error instanceof ProjectReadOnlyError ||
      error instanceof AuthorizationError
    )
      return { kind: "error" };
    throw error;
  }
}
export async function launchMeasurementSettingsAction(
  input: PaidLaunchCommand,
): Promise<LaunchRankCheckRunActionResult> {
  const actor = await getActionActor();
  try {
    return await launchMeasurementSettingsHost({ actor }, input);
  } catch (error) {
    const budget = budgetFailureResult(error);
    if (budget) return budget;
    if (error instanceof ActionPaymentError) {
      const code = paymentLaunchCode(error.reason);
      if (code) return { status: "not_started", code, message: error.message };
    }
    if (error instanceof PreviewTokenError)
      return {
        status: "not_started",
        code: error.code === "expired" ? "preview_expired" : "preview_mismatch",
        message: error.message,
      };
    if (error instanceof LaunchRankCheckRunError || error instanceof SampleProjectError)
      return { status: "not_started", code: error.code, message: error.message };
    if (error instanceof SettingsHostError || error instanceof ZodError)
      return {
        status: "not_started",
        code: "preview_mismatch",
        message: "Measurement settings changed. Preview again.",
      };
    throw error;
  }
}
async function save(
  input: ScheduleIntentCommand | SettingsIntentCommand,
  kind: "schedule" | "intent",
): Promise<IntentResult> {
  const actor = await getActionActor();
  try {
    return {
      kind: "saved",
      value:
        kind === "schedule"
          ? await saveMeasurementScheduleHost({ actor }, input as ScheduleIntentCommand)
          : await saveMeasurementIntentHost({ actor }, input as SettingsIntentCommand),
    };
  } catch (error) {
    if (error instanceof SettingsHostError)
      return error.code === "settings_conflict" || error.code === "mutation_conflict"
        ? { kind: "conflict", currentRevision: null }
        : {
            kind: "not_saved",
            code:
              error.code === "unsupported_capability"
                ? "unsupported_capability"
                : "invalid_settings",
          };
    if (error instanceof PreviewTokenError)
      return {
        kind: "not_saved",
        code: error.code === "expired" ? "preview_expired" : "preview_mismatch",
      };
    if (error instanceof AuthorizationError || error instanceof ProjectReadOnlyError)
      return { kind: "unconfirmed", code: "forbidden" };
    if (error instanceof ZodError) return { kind: "not_saved", code: "invalid_settings" };
    // Infrastructure failures remain unknown: the client retries the original operation/key.
    throw error;
  }
}
export async function saveMeasurementScheduleAction(input: ScheduleIntentCommand) {
  return save(input, "schedule");
}
export async function saveMeasurementIntentAction(input: SettingsIntentCommand) {
  return save(input, "intent");
}
