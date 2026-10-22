"use server";

import type { ActionPaymentFailure } from "@/lib/action-payment/contract";
import { ActionPaymentError } from "@/lib/action-payment/token";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { budgetFailureResult } from "@/lib/rank-check/budget-failure";
import { launchRankCheckRun } from "@/lib/rank-check/runs/launch";
import { LaunchRankCheckRunError, SampleProjectError } from "@/lib/rank-check/runs/launch-types";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import {
  type LaunchRankCheckRunActionFailure,
  type LaunchRankCheckRunActionResult,
  launchRankCheckRunActionSchema,
} from "./rank-check-run-launch-result";

function failure(
  code: LaunchRankCheckRunActionFailure["code"],
  message: string,
): LaunchRankCheckRunActionFailure {
  return { code, message, status: "not_started" };
}

function paymentFailureCode(reason: ActionPaymentFailure): LaunchRankCheckRunActionFailure["code"] {
  switch (reason) {
    case "payment_quote_expired":
      return "preview_expired";
    case "payment_quote_changed":
      return "preview_mismatch";
    case "payment_quote_required":
    case "payment_unavailable":
      return "payment_unavailable";
    case "payment_already_executed":
      return "payment_already_executed";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

export async function launchRankCheckRunAction(
  input: unknown,
): Promise<LaunchRankCheckRunActionResult> {
  const data = parseActionInput(launchRankCheckRunActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  try {
    return await launchRankCheckRun({
      actorId: actor.id,
      paymentOptionId: data.paymentOptionId,
      acceptedPayment: data.acceptedPayment,
      requirePayment: true,
      depth: data.depth,
      idempotencyKey: data.idempotencyKey,
      origin: APP_REQUEST_ORIGIN,
      previewToken: data.previewToken,
      project,
      providerId: data.providerId,
      spec: data.spec,
      trigger: "manual",
    });
  } catch (error) {
    const budgetFailure = budgetFailureResult(error);
    if (budgetFailure) return budgetFailure;
    if (error instanceof ActionPaymentError)
      return failure(paymentFailureCode(error.reason), error.message);
    if (error instanceof PreviewTokenError) {
      return failure(
        error.code === "expired" ? "preview_expired" : "preview_mismatch",
        error.message,
      );
    }
    if (error instanceof LaunchRankCheckRunError) return failure(error.code, error.message);
    if (error instanceof SampleProjectError) return failure(error.code, error.message);
    throw error;
  }
}
