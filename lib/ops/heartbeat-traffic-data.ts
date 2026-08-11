import "server-only";

import { prisma } from "@/lib/db/prisma";
import { projectLabel } from "@/lib/ops/labels";
import {
  hasProviderFailureShare,
  hasTrafficFailureStreak,
  isTransientTrafficFailure,
} from "@/lib/traffic/failure-policy";
import { type TrafficMetrics, trafficMetrics } from "./heartbeat-traffic-metrics";

export type TrafficHeartbeatRow = TrafficMetrics & {
  connectionId?: string | null;
  errorClass?: string | null;
  failureEscalated?: boolean;
  latestSuccessAt: string | null;
  project: string;
  projectId?: string;
  provider: string;
  status: string;
};

const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function collectTrafficHeartbeat(now: Date, since: Date) {
  const historySince = new Date(now.getTime() - HISTORY_WINDOW_MS);
  const [runs, connections] = await Promise.all([
    prisma.operationalRun.findMany({
      orderBy: { startedAt: "desc" },
      select: {
        connectionId: true,
        errorClass: true,
        finishedAt: true,
        meta: true,
        projectId: true,
        provider: true,
        startedAt: true,
        status: true,
      },
      where: { kind: "traffic_sync", startedAt: { gte: historySince } },
    }),
    prisma.providerConnection.findMany({
      select: {
        id: true,
        project: { select: { domain: true, id: true, name: true } },
        provider: true,
        status: true,
      },
      where: {
        enabled: true,
        kind: "analytics",
        status: { in: ["connected", "needs_reauth"] },
      },
    }),
  ]);
  const runProjectIds = [...new Set(runs.flatMap((run) => (run.projectId ? [run.projectId] : [])))];
  const runProjects =
    runProjectIds.length > 0
      ? await prisma.project.findMany({
          select: { domain: true, id: true, name: true },
          where: { id: { in: runProjectIds } },
        })
      : [];
  const projectById = new Map(runProjects.map((project) => [project.id, project]));
  const grouped = new Map<string, TrafficHeartbeatRow>();

  for (const connection of connections) {
    grouped.set(`${connection.project.id}:${connection.provider}`, {
      connectionId: connection.id,
      latestSuccessAt: null,
      project: projectLabel(
        connection.project.id,
        connection.project.name,
        connection.project.domain,
      ),
      projectId: connection.project.id,
      provider: connection.provider,
      rowsFetched: 0,
      rowsMatched: 0,
      rowsUpserted: 0,
      status: connection.status === "needs_reauth" ? "needs_reauth" : "not_run",
    });
  }

  for (const run of runs) {
    const key = `${run.projectId ?? "instance"}:${run.provider ?? "unknown"}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        connectionId: run.connectionId,
        errorClass: run.errorClass,
        latestSuccessAt: null,
        project: run.projectId
          ? projectLabel(
              run.projectId,
              projectById.get(run.projectId)?.name,
              projectById.get(run.projectId)?.domain,
            )
          : "instance",
        projectId: run.projectId ?? "instance",
        provider: run.provider ?? "unknown",
        rowsFetched: 0,
        rowsMatched: 0,
        rowsUpserted: 0,
        status: run.status,
      });
    } else if (existing.status === "not_run") {
      existing.status = run.status;
      existing.errorClass = run.errorClass;
    }
    const target = grouped.get(key);
    if (!target) continue;
    if (!target.latestSuccessAt && run.status.startsWith("succeeded_")) {
      target.latestSuccessAt = (run.finishedAt ?? run.startedAt).toISOString();
    }
    if (run.startedAt >= since) {
      const metrics = trafficMetrics(run.meta);
      target.rowsFetched += metrics.rowsFetched;
      target.rowsMatched += metrics.rowsMatched;
      target.rowsUpserted += metrics.rowsUpserted;
    }
  }

  const totals = new Map<string, number>();
  const failedConnections = new Map<string, Set<string>>();
  const runsByConnection = new Map<string, Array<{ errorClass: string | null; status: string }>>();
  const activeConnectionIds = new Set(connections.map((connection) => connection.id));
  const latestActiveRuns = new Map<
    string,
    { errorClass: string | null; provider: string | null; status: string }
  >();
  for (const connection of connections) {
    totals.set(connection.provider, (totals.get(connection.provider) ?? 0) + 1);
  }
  for (const run of runs) {
    if (run.connectionId) {
      const history = runsByConnection.get(run.connectionId) ?? [];
      history.push({ errorClass: run.errorClass, status: run.status });
      runsByConnection.set(run.connectionId, history);
    }
    if (
      run.connectionId &&
      activeConnectionIds.has(run.connectionId) &&
      run.startedAt >= since &&
      !latestActiveRuns.has(run.connectionId)
    ) {
      latestActiveRuns.set(run.connectionId, {
        errorClass: run.errorClass,
        provider: run.provider,
        status: run.status,
      });
    }
  }
  for (const [connectionId, run] of latestActiveRuns) {
    if (run.provider && run.status === "failed" && isTransientTrafficFailure(run.errorClass)) {
      const failed = failedConnections.get(run.provider) ?? new Set<string>();
      failed.add(connectionId);
      failedConnections.set(run.provider, failed);
    }
  }
  for (const row of grouped.values()) {
    const active = Boolean(row.connectionId && activeConnectionIds.has(row.connectionId));
    const providerWide =
      active &&
      hasProviderFailureShare(
        failedConnections.get(row.provider)?.size ?? 0,
        totals.get(row.provider) ?? 0,
      );
    const connectionStreak =
      active && row.connectionId
        ? hasTrafficFailureStreak(runsByConnection.get(row.connectionId) ?? [])
        : false;
    if (
      active &&
      row.status === "failed" &&
      (row.errorClass === "provider_4xx" ||
        (isTransientTrafficFailure(row.errorClass) && (providerWide || connectionStreak)))
    ) {
      row.failureEscalated = true;
    }
  }

  return [...grouped.values()];
}
