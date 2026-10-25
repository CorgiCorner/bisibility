import { surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";

export type RoutingRun = {
  id: string;
  projectId: string;
  trigger: string;
  source: string | null;
  parentRunId: string | null;
  requestedById: string | null;
  deletedAt: Date | null;
};
export type SummaryRoute =
  | { kind: "manual"; runId: string; userId: string }
  | { kind: "scheduled" }
  | { kind: "none" };

/** Retry inherits origin, while its summary belongs to the retry and its requester. */
export function routeCheckSummary(
  checkTrigger: string | null,
  run: RoutingRun | null,
  ancestors: ReadonlyMap<string, RoutingRun>,
): SummaryRoute {
  if (!run) return { kind: checkTrigger === "scheduled" ? "scheduled" : "none" };
  const origin = checkRunOrigin(run, ancestors);
  if (!origin || effectiveRunTrigger(run, ancestors) === "programmatic") return { kind: "none" };
  if (origin.trigger === "scheduled") return { kind: "scheduled" };
  if (origin.trigger === "manual" && run.requestedById)
    return { kind: "manual", runId: run.id, userId: run.requestedById };
  return { kind: "none" };
}

export function checkRunOrigin(
  run: RoutingRun,
  ancestors: ReadonlyMap<string, RoutingRun>,
): RoutingRun | null {
  let origin = run;
  const seen = new Set<string>();
  while (origin.trigger === "retry") {
    if (seen.has(origin.id) || !origin.parentRunId) return null;
    seen.add(origin.id);
    const parent = ancestors.get(origin.parentRunId);
    if (!parent || parent.projectId !== run.projectId || parent.deletedAt) return null;
    origin = parent;
  }
  if (run.deletedAt || origin.deletedAt) return null;
  if (
    origin.source !== null &&
    !["app", "worker", "api", "sdk", "cli", "mcp"].includes(origin.source)
  )
    return null;
  return origin;
}

export function effectiveRunTrigger(run: RoutingRun, ancestors: ReadonlyMap<string, RoutingRun>) {
  const origin = checkRunOrigin(run, ancestors);
  if (!origin) return null;
  if (
    origin.trigger === "api" ||
    surfaceOf(origin.source as ProviderRequestSource | null) === "programmatic"
  )
    return "programmatic";
  return origin.trigger === "manual" || origin.trigger === "scheduled" ? origin.trigger : null;
}
