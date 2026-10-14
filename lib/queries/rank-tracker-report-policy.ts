import { isPublicIdOfType } from "@/lib/db/public-id";
import type { RankReportLimits, RankReportPolicy } from "@/lib/rank-reports/model";
import { RankTrackerReportConfigurationError } from "./rank-tracker-report-model";

export function validateRankTrackerReportPolicy(
  policy: RankReportPolicy,
  asOf: Date,
  limits: RankReportLimits,
  projectId: string,
) {
  const validDate = (date: Date) => Number.isFinite(date.getTime());
  const fail = () => {
    throw new RankTrackerReportConfigurationError();
  };
  if (!validDate(asOf) || policy.asOf.getTime() !== asOf.getTime()) fail();
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1)) fail();
  if (!Number.isSafeInteger(policy.horizon) || policy.horizon <= 0) fail();
  if (policy.freshForMs !== null && (!Number.isFinite(policy.freshForMs) || policy.freshForMs < 0))
    fail();
  if (
    policy.minimumRequestedDepth !== null &&
    (!Number.isSafeInteger(policy.minimumRequestedDepth) || policy.minimumRequestedDepth < 1)
  )
    fail();
  if (
    policy.currentNotBefore &&
    (!validDate(policy.currentNotBefore) || policy.currentNotBefore > asOf)
  )
    fail();
  if (
    policy.baseline.mode === "before" &&
    (!validDate(policy.baseline.before) ||
      policy.baseline.before > asOf ||
      (policy.baseline.notBefore &&
        (!validDate(policy.baseline.notBefore) ||
          policy.baseline.notBefore > policy.baseline.before)))
  )
    fail();
  if (
    policy.baselineExpectedIds &&
    (policy.baselineProjectId !== projectId ||
      new Set(policy.baselineExpectedIds).size !== policy.baselineExpectedIds.length ||
      policy.baselineExpectedIds.some((id) => !isPublicIdOfType(id, "kw")))
  )
    fail();
}
