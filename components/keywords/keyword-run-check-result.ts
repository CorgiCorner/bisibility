import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";

export type KeywordRunCheckOutcome = "blocked" | "completed" | "running";

function resultCode(result: unknown) {
  if (!result || typeof result !== "object" || !("code" in result)) return null;
  return typeof result.code === "string" ? result.code : null;
}

function resultStatus(result: unknown) {
  if (!result || typeof result !== "object" || !("status" in result)) return null;
  return typeof result.status === "string" ? result.status : null;
}

function resultMessage(result: unknown) {
  if (!result || typeof result !== "object" || !("message" in result)) return null;
  return typeof result.message === "string" ? result.message : null;
}

export function keywordRunCheckOutcome(result: unknown): KeywordRunCheckOutcome {
  if (
    isBudgetExhaustedResult(result) ||
    resultStatus(result) === "not_started" ||
    resultCode(result) === "check_in_progress"
  ) {
    return "blocked";
  }
  return resultStatus(result) === "completed" ? "completed" : "running";
}

export function keywordRunCheckBlockMessage(result: unknown, fallback: string) {
  return resultMessage(result) ?? fallback;
}

export function keywordRunCheckId(result: unknown): string | null {
  if (!result || typeof result !== "object" || !("rankCheckId" in result)) return null;
  return typeof result.rankCheckId === "string" ? result.rankCheckId : null;
}
