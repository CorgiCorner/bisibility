import type { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import type { useTranslations } from "next-intl";
import { presentBulkActionError } from "./bulk-action-error";

type ScheduleRequestProblem = "forbidden" | "notFound" | "unauthorized" | "validation" | "unknown";
type ScheduleMessages = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.schedule">
>;

export class CurrentScheduleUnavailableError extends Error {}

class ScheduleRequestError extends Error {
  constructor(readonly problem: ScheduleRequestProblem) {
    super(problem);
  }
}

function problemCode(body: unknown) {
  if (!body || typeof body !== "object" || !("type" in body) || typeof body.type !== "string") {
    return null;
  }
  const code = body.type.split("/").at(-1);
  return code === "forbidden" ||
    code === "not_found" ||
    code === "unauthorized" ||
    code === "validation_failed"
    ? code
    : null;
}

function scheduleRequestProblem(response: Response, body: unknown): ScheduleRequestProblem {
  const code = problemCode(body);
  if (response.status === 401 || code === "unauthorized") return "unauthorized";
  if (response.status === 403 || code === "forbidden") return "forbidden";
  if (response.status === 404 || code === "not_found") return "notFound";
  if (response.status === 400 || code === "validation_failed") return "validation";
  return "unknown";
}

export function scheduleSaveError(
  cause: unknown,
  sharedErrors: ReturnType<typeof useSharedErrorMessages>,
  t: ScheduleMessages,
) {
  if (cause instanceof CurrentScheduleUnavailableError) return t("currentUnavailable");
  if (cause instanceof ScheduleRequestError) {
    if (cause.problem === "unauthorized") return t("saveUnauthorized");
    if (cause.problem === "forbidden") return t("saveForbidden");
    if (cause.problem === "notFound") return t("saveNotFound");
    if (cause.problem === "validation") return t("saveValidationFailed");
  }
  return presentBulkActionError(cause, sharedErrors, t("saveFailed"));
}

export async function requestApi<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ScheduleRequestError(scheduleRequestProblem(response, body));
  }
  if (!body || typeof body !== "object" || !("data" in body) || body.data === undefined) {
    throw new ScheduleRequestError("unknown");
  }
  return body.data as T;
}
