import "server-only";
import { CapacityLimitError } from "@/lib/capacity/errors";
import { MISSING_PROJECT_BUDGET_MESSAGE } from "@/lib/metering/budget-denial";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  payload?: unknown;
  problem?: unknown;
  status?: unknown;
};

function toStructuredContent(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { value: data };
}

export function jsonToolResult(data: unknown) {
  return {
    content: [{ text: JSON.stringify(data, null, 2), type: "text" as const }],
    structuredContent: toStructuredContent(data),
  };
}

function isErrorLike(error: unknown): error is ErrorLike {
  return Boolean(error && typeof error === "object");
}

export function serializeToolError(error: unknown) {
  if (error instanceof CapacityLimitError)
    return {
      code: error.code,
      message: `${error.message}${error.upgradeUrl ? ` Review plans: ${error.upgradeUrl}` : ""}`,
      details: error.toJSON(),
      status: 403,
    };
  if (isOperationAccessDeniedError(error) && error.subscriptionRequired)
    return {
      code: "subscription_required",
      message:
        "Paid access is required for this operation. Ask the project owner to activate a subscription.",
      status: 403,
    };
  if (!isErrorLike(error)) {
    return {
      message: typeof error === "string" ? error : "Unknown error.",
      name: "Error",
    };
  }

  return {
    code: typeof error.code === "string" ? error.code : undefined,
    message: typeof error.message === "string" ? error.message : "Unknown error.",
    name: typeof error.name === "string" ? error.name : "Error",
    payload: error.payload,
    problem: error.problem,
    status: typeof error.status === "number" ? error.status : undefined,
  };
}

export function errorToolResult(error: unknown) {
  const serialized = serializeToolError(error);

  return {
    content: [{ text: JSON.stringify({ error: serialized }, null, 2), type: "text" as const }],
    isError: true,
    structuredContent: { error: serialized },
  };
}

const budgetResetLabelFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function isBudgetExhaustedProblem(payload: unknown): payload is Record<string, unknown> {
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    typeof (payload as { type?: unknown }).type === "string" &&
    (payload as { type: string }).type.endsWith("/budget_exhausted")
  );
}

function budgetResetLabel(payload: Record<string, unknown>): string {
  const details = payload.details as { resets_at?: unknown } | undefined;
  const resetsAt =
    details && typeof details === "object" && typeof details.resets_at === "string"
      ? new Date(details.resets_at)
      : null;
  if (resetsAt && !Number.isNaN(resetsAt.getTime())) {
    return budgetResetLabelFormatter.format(resetsAt);
  }
  return "next month";
}

export function budgetExhaustedMessage(payload: Record<string, unknown>): string {
  if ((payload.details as { reason?: unknown } | undefined)?.reason === "budget_missing")
    return MISSING_PROJECT_BUDGET_MESSAGE;
  return `Provider budget for API, MCP and SDK is exhausted until ${budgetResetLabel(payload)}. Ask the project owner to raise it in Settings > Usage.`;
}

function trustedTopUpPath(payload: Record<string, unknown>): string | null {
  const details = payload.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const path = (details as { top_up_url?: unknown }).top_up_url;
  return typeof path === "string" && /^\/app\/prj_[a-z][a-z0-9]{23}\/settings\/billing$/.test(path)
    ? path
    : null;
}

/**
 * The error object the MCP server surfaces for a failed REST call. A budget
 * problem gets a sentence an agent can act on; everything else keeps the
 * generic failure message.
 */
const BYOK_REQUIRED_MESSAGE =
  "This account runs paid provider work only on its own provider keys. Connect the provider key in the project's Integrations settings on the web, then retry.";

function ownKeyRequiredMessage(payload: Record<string, unknown>) {
  return typeof payload.detail === "string" && payload.detail.length > 0
    ? payload.detail
    : BYOK_REQUIRED_MESSAGE;
}

export function restFailureToolError(payload: unknown, status: number | undefined) {
  if (
    status === 429 &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as { type?: unknown }).type ===
      "https://bisibility.com/problems/weekly_request_cap_reached"
  ) {
    return {
      code: "weekly_request_cap_reached",
      message:
        typeof (payload as { detail?: unknown }).detail === "string"
          ? (payload as { detail: string }).detail
          : "Weekly request capacity reached. Retry after the weekly reset.",
      payload,
      status,
    };
  }
  if (
    status === 403 &&
    payload &&
    typeof payload === "object" &&
    (payload as { type?: unknown }).type === "https://bisibility.com/problems/plan_limit_reached"
  ) {
    const problem = payload as { detail?: string; details?: { upgradeUrl?: string } };
    return {
      code: "plan_limit_reached",
      message: `${problem.detail ?? "Capacity limit reached."}${problem.details?.upgradeUrl ? ` Review plans: ${problem.details.upgradeUrl}` : ""}`,
      payload,
      status,
    };
  }
  if (
    status === 403 &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as { type?: unknown }).type === "https://bisibility.com/problems/subscription-required"
  ) {
    return {
      code: "subscription_required",
      message:
        "Paid access is required for this operation. Ask the project owner to activate a subscription.",
      payload,
      status: 403,
    };
  }
  if (
    status === 403 &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as { type?: unknown }).type === "https://bisibility.com/problems/byok_required"
  ) {
    return {
      code: "byok_required",
      message: ownKeyRequiredMessage(payload as Record<string, unknown>),
      payload,
      status: 403,
    };
  }
  if (
    status === 402 &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as { type?: unknown }).type === "https://bisibility.com/problems/credits_exhausted"
  ) {
    const path = trustedTopUpPath(payload as Record<string, unknown>);
    return {
      code: "credits_exhausted",
      message: path
        ? `Deployment credits are exhausted. Ask the project owner to add credits in Billing (${path}) or connect their own provider key.`
        : "Deployment credits are exhausted. Ask the project owner to open Billing in project settings to add credits, or connect their own provider key.",
      payload,
      status: 402,
    };
  }
  if (isBudgetExhaustedProblem(payload)) {
    return {
      code: "budget_exhausted",
      message: budgetExhaustedMessage(payload),
      payload,
      status: 429,
    };
  }
  return { message: "bisibility API request failed.", payload, status };
}
