import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import { BusinessLocationUnavailableError } from "@/lib/business-location-store/errors";
import { auditKeywordExport } from "@/lib/keywords/export-audit";
import {
  LocalResultCapacityError,
  LocalResultSelectionError,
  LocalResultSnapshotConflictError,
  LocalResultUnavailableError,
} from "@/lib/local-monitor-results/errors";
import { exportLocalRunResult } from "@/lib/local-monitor-results/export";
import { readMonitorRunHistory } from "@/lib/local-monitor-results/history";
import { readMonitorPointHistory } from "@/lib/local-monitor-results/point-history";
import { readMonitorPointListings, readMonitorRunResult } from "@/lib/local-monitor-results/read";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { RankReportCursorError } from "@/lib/rank-reports/errors";
import { ZodError } from "zod";
import type { ApiContext } from "./context";
import { ApiInputError } from "./errors";
import {
  publicLocalListing,
  publicLocalPointHistory,
  publicLocalRunHistory,
  publicLocalRunResult,
} from "./local-monitor-public";
import { localMonitorApiReadContext } from "./local-monitor-read-context";
import { type LocalMonitorReadSelection, localMonitorReadInput } from "./local-monitor-read-input";
import { dataResponse, errorResponse } from "./responses";
import { scopedProject, snakeizeKeys } from "./surface";

const readers = {
  history: readMonitorRunHistory,
  result: readMonitorRunResult,
  listings: readMonitorPointListings,
  point_history: readMonitorPointHistory,
};
export type LocalMonitorApiReaders = typeof readers;

/** GET-only retained services; no launch, provider, scheduler or accounting initializer. */
export async function readLocalMonitorApi(
  ctx: ApiContext,
  selection: LocalMonitorReadSelection,
  ports: LocalMonitorApiReaders = readers,
) {
  const scoped = scopedProject(ctx, selection.projectId);
  if (scoped) return scoped;
  try {
    const input = localMonitorReadInput(ctx, selection);
    const context = localMonitorApiReadContext(ctx);
    let value: object;
    if (selection.kind === "history")
      value = publicLocalRunHistory(await ports.history(input, context));
    else if (selection.kind === "point_history")
      value = publicLocalPointHistory(await ports.point_history(input, context));
    else if (selection.kind === "listings")
      value = (await ports.listings(input, context)).map(publicLocalListing);
    else {
      const report = await ports.result(
        {
          projectId: input.projectId,
          monitorId: input.monitorId,
          ...("runId" in input ? { runId: input.runId } : {}),
          ...(input.asOf === undefined ? {} : { asOf: input.asOf }),
        },
        context,
      );
      if (selection.kind === "export") {
        if (!("format" in input) || (input.format !== "json" && input.format !== "csv"))
          throw new ApiInputError("Invalid Local export format.");
        const download = exportLocalRunResult(report, input.format);
        await auditKeywordExport(
          ctx.actorId ?? null,
          ctx.auth.project.id,
          selection.projectId,
          new Set(report.points.map((point) => point.keywordId)).size,
          input.format,
          "history",
        );
        const headers = new Headers(ctx.headers);
        headers.set("Content-Type", download.mediaType);
        headers.set("Content-Disposition", `attachment; filename="${download.filename}"`);
        headers.set("X-Bisibility-Report-As-Of", report.asOf);
        headers.set("X-Bisibility-Report-Version", "local-point-report-v1");
        return new Response(download.text, { headers });
      }
      value = publicLocalRunResult(report);
    }
    return dataResponse(snakeizeKeys(value), { headers: ctx.headers });
  } catch (error) {
    const init = { headers: ctx.headers, instance: ctx.instance };
    if (error instanceof AuthorizationError)
      return errorResponse("forbidden", "The retained Local scope is unavailable.", 403, init);
    if (
      error instanceof ZodError ||
      error instanceof ApiInputError ||
      error instanceof LocalResultSelectionError
    )
      return errorResponse("bad_request", "Invalid Local result selection.", 400, init);
    if (error instanceof RankReportCursorError)
      return errorResponse("invalid_cursor", "Restart this Local history selection.", 400, init);
    if (error instanceof LocalResultSnapshotConflictError)
      return errorResponse("conflict", error.message, 409, init);
    if (error instanceof LocalResultCapacityError)
      return errorResponse("bad_request", error.message, 413, init);
    if (
      error instanceof LocalResultUnavailableError ||
      error instanceof LocalMeasurementUnavailableError ||
      error instanceof BusinessLocationUnavailableError
    )
      return errorResponse("not_found", "The retained Local scope is unavailable.", 404, init);
    throw error;
  }
}
