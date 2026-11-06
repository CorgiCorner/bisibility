import "server-only";

import { awaitWithSignal, withDeadline } from "@/lib/async/abort";
import { reportRequestFailure } from "@/lib/observability/request-failure";
import { analyticsReadDeadlineMs } from "@/lib/providers/analytics/read-deadline";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { readPerformanceTotals } from "@/lib/search-insights/performance-totals";
import {
  performanceTotalsQuery,
  performanceWindow,
} from "@/lib/search-insights/performance-totals-model";
import { readSearchInsightsConnection } from "@/lib/search-insights/sync/credentials";
import type { ApiContext } from "./context";
import { errorResponse, resourceResponse } from "./responses";
import { scopedProject } from "./surface";

export async function getSearchPerformanceTotals(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = performanceTotalsQuery.parse({
    start_date: ctx.url.searchParams.get("start_date") ?? "",
    end_date: ctx.url.searchParams.get("end_date") ?? "",
    compare_previous: ctx.url.searchParams.get("compare_previous") ?? undefined,
  });
  const options = { headers: ctx.headers, instance: ctx.instance };
  let connectionId: string | undefined;
  try {
    return await withDeadline(ctx.req.signal, analyticsReadDeadlineMs(), (signal) =>
      awaitWithSignal(async () => {
        signal.throwIfAborted();
        const resolved = await readSearchInsightsConnection(ctx.auth.project.id);
        signal.throwIfAborted();
        if (!resolved.connection) {
          return errorResponse(
            "provider_unavailable",
            resolved.problem === "needs_reauth"
              ? "Provider authorization must be renewed."
              : "No eligible search-performance source is connected.",
            resolved.problem === "needs_reauth" ? 422 : 404,
            options,
          );
        }
        const connection = resolved.connection;
        connectionId = connection.connectionId;
        const result = await readPerformanceTotals({
          projectId: ctx.auth.project.id,
          property: connection.property,
          credentials: connection.credentials,
          window: performanceWindow(input),
          comparePrevious: input.compare_previous === "true",
          signal,
        });
        return resourceResponse(result, options);
      }, signal),
    );
  } catch (error) {
    if (ctx.req.signal.aborted || (error instanceof Error && error.name === "TimeoutError")) {
      if (!ctx.req.signal.aborted) reportRequestFailure(error, "api_dispatch", 504);
      return errorResponse(
        "provider_unavailable",
        ctx.req.signal.aborted
          ? "Provider request was cancelled."
          : "Provider request deadline reached.",
        ctx.req.signal.aborted ? 400 : 504,
        options,
      );
    }
    if (!(error instanceof ProviderAuthError) || !connectionId) throw error;
    await markProviderNeedsReauth({
      connectionId,
      projectId: ctx.auth.project.id,
      provider: "gsc",
    });
    return errorResponse(
      "provider_unavailable",
      "Provider authorization must be renewed.",
      422,
      options,
    );
  }
}
