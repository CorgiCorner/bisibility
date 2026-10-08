import "server-only";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import { readDeploymentMeteringAuthority } from "@/lib/providers/execution-extension";
import { requireReadableProject } from "@/lib/queries/_auth";
import type { AccessContext, Source } from "@usagekit/core";
import { mapAdminQueries } from "./admin-batch";
import { readOwnConnectionBudgets } from "./own-budget-read";
import { meteringNamespace, meteringRuntime } from "./runtime";
import {
  projectAuthority,
  projectBudgetFiguresKnown,
  projectBudgetRow,
  projectUsageRow,
} from "./user-model";
import type { ProjectMeteringBudget, ProjectMeteringUsage } from "./user-types";

const sources: readonly Source[] = ["app", "worker", "api", "sdk", "cli", "mcp", "proxy"];
const connectionLimit = 20;

/** Auth and scope come exclusively from the verified project session, never a caller scope. */
export async function getProjectMeteringUsage(projectRef: string): Promise<ProjectMeteringUsage> {
  const { actor, project } = await requireReadableProject(projectRef);
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const to = now.toISOString();
  const empty: ProjectMeteringUsage = {
    status: "unavailable",
    from,
    to,
    asOf: null,
    authority: "unknown",
    observed: false,
    truncated: false,
    unresolved: 0,
    oldestUnresolvedAt: null,
    rows: [],
    budgets: [],
  };
  // Billing is an owner-only resource in this host. Ordinary project membership must
  // never grant owner-wide usage, wallet details, shared tag totals or pool visibility.
  if (
    actor.id !== project.ownerId ||
    !canProjectAction(getProjectRole(actor, project.id), "read", "billing")
  )
    return { ...empty, status: "restricted" };
  try {
    const namespace = meteringNamespace();
    const access: AccessContext = {
      namespace,
      readablePrincipals: [project.ownerId],
      readableGroups: [project.id],
      readablePools: [],
      canReadBillingDetail: true,
      canManageBudgets: false,
    };
    const [{ meter }, connections] = await Promise.all([
      meteringRuntime(),
      prisma.providerConnection.findMany({
        where: { projectId: project.id },
        orderBy: { id: "asc" },
        take: connectionLimit + 1,
        select: { id: true, publicId: true, provider: true },
      }),
    ]);
    const scope = { kind: "group" as const, namespace, group: project.id };
    const [usage, pending] = await Promise.all([
      meter.usage(access, {
        scope,
        from,
        to,
        units: ["cents", "units", "customer_cents"],
        // Split before filtering so a transferred project's former payer cannot be
        // combined with the current owner's observations. Principal never reaches UI.
        groupBy: ["principal", "connection", "provider", "surface", "source"],
        limit: 100,
      }),
      meter.listOperations(access, {
        scope,
        // Retained exposure survives month boundaries; do not hide an older pending call.
        from: "1970-01-01T00:00:00.000Z",
        to,
        states: ["reserved", "dispatch_intended", "pending"],
        limit: 100,
      }),
    ]);
    if (usage.outcome !== "ok" || pending.outcome !== "ok")
      throw new Error("Meter read unavailable");
    const selected = connections.slice(0, connectionLimit);
    const refs = new Map(selected.map((connection) => [connection.id, connection.publicId]));
    const [statuses, coverage, own] = await Promise.all([
      mapAdminQueries(
        selected.flatMap((connection) => sources.map((source) => ({ connection, source }))),
        async ({ connection, source }) => {
          const result = await meter.applicableBudgets(access, {
            scope: {
              namespace,
              principal: project.ownerId,
              group: project.id,
              connection: connection.id,
            },
            source,
            surface: source === "app" || source === "worker" ? "app" : "programmatic",
            units: ["cents", "units", "customer_cents", "requests"],
          });
          if (result.outcome !== "ok") throw new Error("Meter limits unavailable");
          return { connection, statuses: result.value };
        },
      ),
      mapAdminQueries(selected, (connection) =>
        readDeploymentMeteringAuthority({
          namespace,
          connectionId: connection.id,
          from,
          to,
        }),
      ),
      mapAdminQueries(selected, (connection) =>
        readOwnConnectionBudgets({
          namespace,
          actorId: actor.id,
          projectId: project.id,
          connectionId: connection.id,
        }),
      ),
    ]);
    const epochStarts = statuses
      .flatMap((result) => result.statuses)
      .filter(
        (status) =>
          status.budget.scope.kind === "connection" || status.budget.scope.kind === "group",
      )
      .map((status) => status.epoch.startsAt)
      .sort();
    const provenance = epochStarts.length
      ? await meter.listOperations(access, {
          scope,
          from: epochStarts[0],
          to,
          limit: 100,
        })
      : null;
    if (provenance && provenance.outcome !== "ok") throw new Error("Meter provenance unavailable");
    const completeProvenance = provenance?.outcome === "ok" && !provenance.value.nextCursor;
    const operations = provenance?.outcome === "ok" ? provenance.value.operations : [];
    const budgets: ProjectMeteringBudget[] = [];
    const seen = new Set<string>();
    for (const result of statuses)
      for (const status of result.statuses) {
        if (
          status.budget.scope.kind === "connection" &&
          own.some(
            (verified) =>
              verified?.binding.connection === result.connection.id &&
              verified.binding.namespace === namespace &&
              verified.binding.principal === actor.id &&
              verified.binding.group === project.id &&
              verified.binding.publicConnection === result.connection.publicId &&
              verified.binding.provider === result.connection.provider &&
              status.budget.unit === verified.binding.unit &&
              verified.budgets.length > 0,
          )
        )
          continue;
        const identity = `${status.budget.id}:${status.budget.version}:${status.epoch.epoch}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const row = projectBudgetRow(
          status,
          result.connection.publicId,
          projectBudgetFiguresKnown(status, operations, project.ownerId, completeProvenance),
          result.connection.provider,
        );
        if (row) budgets.push(row);
      }
    for (const result of own) {
      if (
        !result ||
        result.binding.namespace !== namespace ||
        result.binding.principal !== actor.id ||
        result.binding.group !== project.id ||
        refs.get(result.binding.connection) !== result.binding.publicConnection ||
        selected.find((connection) => connection.id === result.binding.connection)?.provider !==
          result.binding.provider
      )
        continue;
      for (const { status, figuresKnown } of result.budgets) {
        const row = projectBudgetRow(
          status,
          result.binding.publicConnection,
          figuresKnown,
          result.binding.provider,
          result.binding,
        );
        if (row) budgets.push(row);
      }
    }
    const rows = usage.value.rows.filter((row) => row.dimensions.principal === project.ownerId);
    const unresolved = pending.value.operations.filter(
      (operation) => operation.scope.principal === project.ownerId,
    );
    const retainedConnection = rows.some((row) => !refs.has(row.dimensions.connection));
    const priorOwner = rows.length !== usage.value.rows.length;
    return {
      ...empty,
      status: "available",
      asOf: usage.value.asOf,
      authority: projectAuthority(
        coverage,
        connections.length <= connectionLimit &&
          !retainedConnection &&
          !priorOwner &&
          !usage.value.nextCursor,
      ),
      observed: rows.length > 0,
      rows: rows.map((row) => projectUsageRow(row, refs.get(row.dimensions.connection) ?? null)),
      budgets,
      unresolved: unresolved.length,
      oldestUnresolvedAt: unresolved[0]?.createdAt ?? null,
      truncated: Boolean(
        usage.value.nextCursor ||
          pending.value.nextCursor ||
          (provenance?.outcome === "ok" && provenance.value.nextCursor) ||
          connections.length > connectionLimit,
      ),
    };
  } catch {
    // A failed observer or authority read cannot turn missing data into a confirmed zero.
    return empty;
  }
}
