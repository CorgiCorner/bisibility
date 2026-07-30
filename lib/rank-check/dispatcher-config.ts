import "@/lib/deployment/runtime-env.generated";
import { dispatcherClaimsAllowed } from "./scheduler-mode";

const DEFAULT_MAX_KEYWORDS_PER_PROJECT_PER_PASS = 25;
const MAX_KEYWORDS_PER_PROJECT_PER_PASS = 100;
const MAX_KEYWORDS_PER_PROJECT_PER_PASS_KEY =
  "RANK_CHECK_DISPATCHER_MAX_KEYWORDS_PER_PROJECT_PER_PASS";

export function isTruthyFlag(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isRankCheckDispatcherEnabled() {
  return dispatcherClaimsAllowed();
}

export function rankCheckDispatcherMaxKeywordsPerProject(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
) {
  const configured = env[MAX_KEYWORDS_PER_PROJECT_PER_PASS_KEY];
  if (configured === undefined) return DEFAULT_MAX_KEYWORDS_PER_PROJECT_PER_PASS;
  const raw = configured.trim();
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`${MAX_KEYWORDS_PER_PROJECT_PER_PASS_KEY} must be an integer from 1 to 100.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_KEYWORDS_PER_PROJECT_PER_PASS) {
    throw new Error(`${MAX_KEYWORDS_PER_PROJECT_PER_PASS_KEY} must be an integer from 1 to 100.`);
  }
  return value;
}
