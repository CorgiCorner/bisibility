import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { normalizeGa4PropertyId } from "@/lib/providers/analytics/property-id";
import { SchedulerDisabledError } from "@/lib/scheduler/driver";
import { addDays, dateFromKey, dateKey, diffDays } from "@/lib/search-insights/dates";
import { searchInsightsPropertyKey } from "@/lib/search-insights/keys";
import { planBackfill } from "@/lib/search-insights/sync/plan";
import { resolveSearchSyncSettings } from "@/lib/settings/search-sync-config";
import {
  startSearchInsightsBackfillWorkflow,
  startSearchInsightsSyncWorkflow,
} from "@/lib/temporal/search-insights-client";
import { SEARCH_INSIGHTS_SOURCE } from "./credentials";
import { type ImportRow, loadImportRow } from "./import-state";

export type EnsureImportInput = {
  projectId: string;
  property: string;
  source: "gsc" | "ga4";
};

export type EnsureImportOptions = {
  /**
   * The caller is a property selection rather than a render, so it may restart an import a
   * render would otherwise leave waiting out its cooldown.
   */
  rearm?: boolean;
};

export type EnsureImportResult = {
  status: "queued" | "exists" | "unavailable";
};

/**
 * How long a render leaves a recorded execution alone. Every day the backfill stores stamps
 * the row, so a progressing import never looks idle and repeated views cost nothing; an import
 * that stopped on a transient fault is picked up again within the window instead of waiting
 * for the customer to select the property again.
 */
export const BACKFILL_RESTART_COOLDOWN_MS = 30 * 60 * 1000;

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Which states a start would actually move. A finished import has no day left to walk back to,
// whoever asks, and a lost authorization is fixed by reconnecting rather than by another
// execution. Everything else is startable, but a render waits out the cooldown first so a
// busy module costs at most one workflow start per window.
async function completedImportNeedsExtension(row: NonNullable<ImportRow>) {
  if (!row.newestFinalizedDate || !row.earliestTargetDate) return false;
  const defaults = await prisma.projectDefaults.findUnique({ where: { projectId: row.projectId } });
  const settings = resolveSearchSyncSettings(defaults);
  const currentEarliest = dateKey(row.earliestTargetDate);
  const target = planBackfill({
    newestFinalizedDate: dateKey(row.newestFinalizedDate),
    retentionMonths: settings.retentionMonths,
  });
  if (target.earliestTargetDate >= currentEarliest) return false;
  await prisma.searchAnalyticsImport.update({
    data: {
      cursorDate: dateFromKey(addDays(currentEarliest, -1)),
      daysTotal: row.daysTotal + diffDays(target.earliestTargetDate, currentEarliest),
      earliestTargetDate: dateFromKey(target.earliestTargetDate),
      state: "queued",
      workflowId: null,
    },
    where: { id: row.id },
  });
  return true;
}

async function backfillNeedsNoStart(row: NonNullable<ImportRow>, options: EnsureImportOptions) {
  if (row.state === "completed") return !(await completedImportNeedsExtension(row));
  if (options.rearm) return false;
  if (row.state === "paused" && ["needs_reauth", "user"].includes(row.pausedReason ?? ""))
    return true;
  // No execution recorded: the backfill was never started or released its id when it stopped,
  // so there is nothing for a second start to collide with.
  if (!row.workflowId) return false;
  return Date.now() - row.updatedAt.getTime() < BACKFILL_RESTART_COOLDOWN_MS;
}

async function backfillIsSettled(input: EnsureImportInput, options: EnsureImportOptions) {
  try {
    const row = await loadImportRow(input.projectId, input.property, input.source);
    if (!row) return false;
    return backfillNeedsNoStart(row, options);
  } catch (error) {
    console.error("[search-insights] import row could not be read", {
      error,
      projectId: input.projectId,
    });
    return false;
  }
}

// The workflow id is deterministic per property, so a repeated selection joins the
// existing execution instead of starting a second sixteen-month backfill. The row is stamped
// unconditionally: `updatedAt` is what the restart cooldown below measures, and a write skipped
// because the id was unchanged would leave that cooldown reading a timestamp no start moves,
// so every render past the window would start again.
async function startBackfill(input: EnsureImportInput) {
  try {
    const started = await startSearchInsightsBackfillWorkflow({
      projectId: input.projectId,
      property: input.property,
      source: input.source,
    });
    await prisma.searchAnalyticsImport.updateMany({
      data: { workflowId: started.workflowId },
      where: {
        projectId: input.projectId,
        property: input.property,
        source: input.source,
      },
    });
    return true;
  } catch (error) {
    if (!(error instanceof SchedulerDisabledError)) {
      console.error("[search-insights] backfill start failed", {
        error,
        projectId: input.projectId,
      });
    }
    return false;
  }
}

// The row key must be the property every reader derives from the stored credentials, not the
// raw value a picker or a render happened to hold: a lowercase or trailing-slash difference
// would key the import to a property the connection guard rejects for good, blocking the
// backfill forever. Both entry points below go through here, so neither can key a row the
// other cannot find.
function importProperty(input: EnsureImportInput): EnsureImportInput {
  if (input.source === SEARCH_INSIGHTS_SOURCE) {
    return { ...input, property: searchInsightsPropertyKey(input.property) ?? input.property };
  }
  const normalized = normalizeGa4PropertyId(input.property);
  return normalized.ok ? { ...input, property: normalized.value } : input;
}

// Records the intent to import and starts the backfill. A plain create lets the unique
// key settle a race, so "queued" only ever reports a real creation. Nothing here throws:
// it runs on read and property-selection paths, which must survive a scheduler or database
// outage with an empty module rather than an error page.
export async function ensureSearchInsightsImport(
  rawInput: EnsureImportInput,
  options: EnsureImportOptions = {},
): Promise<EnsureImportResult> {
  const input = importProperty(rawInput);
  let status: "exists" | "queued";
  try {
    await prisma.searchAnalyticsImport.create({
      data: {
        projectId: input.projectId,
        property: input.property,
        source: input.source,
        state: "queued",
      },
    });
    status = "queued";
  } catch (error) {
    if (!isUniqueViolation(error)) {
      console.error("[search-insights] import row could not be created", {
        error,
        projectId: input.projectId,
      });
      return { status: "unavailable" };
    }
    status = "exists";
  }

  if (status === "exists" && input.source === SEARCH_INSIGHTS_SOURCE) {
    const row = await loadImportRow(input.projectId, input.property, input.source).catch(
      () => null,
    );
    if (row?.state === "completed") {
      try {
        if (await completedImportNeedsExtension(row)) {
          return { status: (await startBackfill(input)) ? status : "unavailable" };
        }
        if (!options.rearm) return { status };
        await startSearchInsightsSyncWorkflow({ projectId: input.projectId });
        return { status };
      } catch (error) {
        if (!(error instanceof SchedulerDisabledError)) {
          console.error("[search-insights] completed import restart failed", {
            error,
            projectId: input.projectId,
          });
        }
        return { status: "unavailable" };
      }
    }
  }
  if (status === "exists" && (await backfillIsSettled(input, options))) return { status };

  return { status: (await startBackfill(input)) ? status : "unavailable" };
}

// The property-selection path. Never fails the caller: queueing the history import is a
// background promise, not a precondition for saving the property. It re-arms immediately
// because a selection is exactly the moment a lost authorization or a missing connection is
// fixed; a render, which calls the seam above, has to wait out the cooldown instead.
export async function queueSearchInsightsImport(input: EnsureImportInput) {
  try {
    await ensureSearchInsightsImport(input, { rearm: true });
  } catch (error) {
    console.error("[search-insights] import could not be queued", {
      error,
      projectId: input.projectId,
    });
  }
}
