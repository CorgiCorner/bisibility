import "server-only";

import { checkTimeWhere, parseExactCheckRange } from "@/lib/checks/exact-range";
import {
  buildCheckRunsView,
  type CheckRunsViewOptions,
  checkRangeStart,
  checkRunsPageLimit,
} from "@/lib/checks/runs-view";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { evidenceMatches, projectionKeys } from "@/lib/provider-evidence/projection/model";
import { readCheckEvidence } from "@/lib/provider-evidence/projection/read";
import {
  ledgerActualCostCents,
  rankCheckLedgerActuals,
} from "@/lib/queries/rank-check-run-accounting";
import { storedResultsSummaries } from "@/lib/queries/retrieved-results";
import { requireReadableProject } from "./_auth";
import { checkRunTriggerWhere } from "./check-run-trigger";
import { loadCheckRunsSummary } from "./check-runs-stats";
import { getRequestSerpProviderChain } from "./workspace-request-data";

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

function statusWhere(status: CheckRunsViewOptions["status"]): Prisma.RankCheckWhereInput {
  if (status && (projectionKeys as readonly string[]).includes(status)) return {};
  if (status === "fallback") return { status: "completed", viaFallback: true };
  if (status && status !== "all" && !(projectionKeys as readonly string[]).includes(status))
    return { status: status as "completed" | "failed" | "running" | "deferred" };
  return { status: { in: ["completed", "failed", "running"] } };
}

export function checkRunRowsWhere(
  projectId: string,
  rangeStart: Date,
  now: Date,
  options: CheckRunsViewOptions,
): Prisma.RankCheckWhereInput {
  const cursorAt = options.cursor ? new Date(options.cursor.checkedAt) : null;
  const cursor =
    cursorAt && Number.isFinite(cursorAt.getTime()) && options.cursor
      ? {
          OR: [
            { checkedAt: { lt: cursorAt } },
            { checkedAt: cursorAt, publicId: { lt: options.cursor.id } },
          ],
        }
      : {};

  const exact = Boolean(parseExactCheckRange(options.from, options.to).range);
  return {
    ...checkTimeWhere(
      rangeStart,
      now,
      Boolean(parseExactCheckRange(options.from, options.to).range),
    ),
    keyword: { projectId },
    ...statusWhere(options.status),
    ...(options.provider && options.provider !== "all" ? { provider: options.provider } : {}),
    ...(options.trigger && options.trigger !== "all" && options.trigger !== "programmatic"
      ? { trigger: options.trigger }
      : {}),
    ...cursor,
    ...(exact ? { AND: [checkTimeWhere(rangeStart, now, true), cursor] } : {}),
  };
}

export async function getCheckRunCount(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  return prisma.rankCheck.count({ where: { keyword: { projectId: project.id } } });
}

export async function getCheckRunsView(projectId: string, options: CheckRunsViewOptions = {}) {
  const now = options.now ?? new Date();
  const range = options.range ?? "7d";
  const exact = parseExactCheckRange(options.from, options.to).range;
  const rangeStart = exact ? new Date(exact.from) : checkRangeStart(range, now);
  const rangeEnd = exact ? new Date(exact.to) : now;
  const limit = checkRunsPageLimit(options.limit);
  const { project } = await requireReadableProject(projectId);
  const triggerWhere = await checkRunTriggerWhere(project.id, options.trigger);
  const timeWhere = checkTimeWhere(rangeStart, rangeEnd, Boolean(exact));
  const incidentRows = options.incidentId
    ? await prisma.providerDispatchIdentity.findMany({
        where: {
          projectId: project.id,
          operation: {
            providerIncidentOperations: {
              some: { incidentId: options.incidentId, incident: { projectId: project.id } },
            },
          },
        },
        select: { rankCheckId: true },
      })
    : null;
  const incidentWhere = incidentRows
    ? { id: { in: incidentRows.map((row) => row.rankCheckId) } }
    : {};
  const scope = { AND: [timeWhere, triggerWhere, incidentWhere] };
  const isProjection = projectionKeys.find((key) => key === options.status);
  const matching = isProjection ? await readCheckEvidence(project.id, { where: scope }) : null;
  const projectionWhere =
    matching && isProjection
      ? {
          publicId: {
            in: [...matching]
              .filter(([, value]) => evidenceMatches(value, isProjection))
              .map(([id]) => id),
          },
        }
      : {};
  const providerChain = getRequestSerpProviderChain(project.id);
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const [rows, summary, staleCount] = await Promise.all([
    prisma.rankCheck.findMany({
      orderBy: [{ checkedAt: "desc" }, { publicId: "desc" }],
      select: {
        attemptCount: true,
        attempts: true,
        checkedAt: true,
        costCents: true,
        degradedToCountry: true,
        error: true,
        estimatedCostCents: true,
        finishedAt: true,
        id: true,
        publicId: true,
        keyword: {
          select: {
            publicId: true,
            text: true,
            device: true,
            locationRef: {
              select: {
                countryCode: true,
                displayName: true,
                languageCode: true,
                languageLabel: true,
              },
            },
          },
        },
        position: true,
        previousPosition: true,
        provider: true,
        requestedDepth: true,
        startedAt: true,
        status: true,
        trigger: true,
        viaFallback: true,
      },
      take: limit + 1,
      where: {
        AND: [
          checkRunRowsWhere(project.id, rangeStart, rangeEnd, { ...options, trigger: "all" }),
          triggerWhere,
          projectionWhere,
          incidentWhere,
        ],
      },
    }),
    loadCheckRunsSummary(project.id, { end: rangeEnd, start: rangeStart }, providerChain, scope),
    prisma.keyword.count({
      where: {
        dispatchState: { isNot: null },
        projectId: project.id,
        rankChecks: {
          none: { checkedAt: { gte: staleBefore }, status: "completed" },
          some: { checkedAt: { lt: staleBefore }, status: "completed" },
        },
      },
    }),
  ]);

  const failedRows = rows.filter((row) => row.status === "failed");
  const actuals = await rankCheckLedgerActuals(
    project.id,
    failedRows.map((row) => row.id),
  );
  const view = buildCheckRunsView(
    rows.map((row) =>
      row.status === "failed"
        ? { ...row, costCents: ledgerActualCostCents(actuals.get(row.id), null) }
        : row,
    ),
    summary,
    { limit, staleCount },
  );
  // Without this the checks table can never expand a completed run: storedResults would
  // stay undefined on every row and the whole surface would be unreachable in production.
  const evidence = await readCheckEvidence(project.id, {
    checkIds: view.rows.map((row) => row.id),
  });
  const stored = await storedResultsSummaries({
    checkIds: view.rows.map((row) => row.id),
    projectId: project.id,
  });

  return {
    ...view,
    rows: view.rows.map((row) => ({
      ...row,
      evidenceProjection: evidence.get(row.id) ?? null,
      storedResults: stored.get(row.id) ?? null,
    })),
  };
}

export type { CheckRunsViewOptions };
