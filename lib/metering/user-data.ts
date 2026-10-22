import "server-only";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { readProjectProviderAccessScope } from "@/lib/queries/provider-access-scope";
import { getRequestPrimarySerpProvider } from "@/lib/queries/workspace-request-data";
import type { AccessContext } from "@usagekit/core";
import { cache } from "react";
import { mapAdminQueries } from "./admin-batch";
import { readOwnConnectionBudgets } from "./own-budget-read";
import { readOwnerUsage } from "./owner-reads";
import { selectPaidWorkBlocked } from "./paid-work-block";
import { readPlatformConnectionBudgets } from "./platform-budget-read";
import type { ProjectBudgetRow } from "./project-budget-display";
import { projectFundingStatuses } from "./project-budget-read";
import { readProjectBudgetStatuses } from "./project-budget-statuses";
import { parseProjectFundingBudgetId, projectBudgetId } from "./project-funding-budgets";
import { meteringNamespace, meteringRuntime } from "./runtime";
import { projectBudgetFiguresKnown, projectBudgetRow } from "./user-model";
import { emptyProjectUsage, type ProjectUsageViews } from "./user-views";

const connectionLimit = 20;
const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

/** Auth and scope come exclusively from the verified project session, never a caller scope. */
const projectContext = perRequestCache(async (projectRef: string) => {
  const { actor, project, scope } = await readProjectProviderAccessScope(projectRef);
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const to = now.toISOString();
  const connections = await prisma.providerConnection.findMany({
    where: { projectId: project.id },
    orderBy: { id: "asc" },
    take: 50,
    select: { id: true, publicId: true, provider: true, credentialSource: true },
  });
  const empty = {
    ...emptyProjectUsage(now),
    canEditBudget: project.writeMode === "active" && scope.canManageProviders,
    connections: connections.map((connection) => ({
      connectionId: connection.publicId,
      provider: connection.provider,
      credentialSource: connection.credentialSource,
    })),
  };
  // Billing is an owner-only resource in this host. Ordinary project membership must
  // never grant owner-wide usage, wallet details, shared tag totals or pool visibility.
  const restricted =
    actor.id !== project.ownerId ||
    !canProjectAction(getProjectRole(actor, project.id), "read", "billing");
  return { actor, project, connections, empty, restricted, from, to };
});

async function readProjectBudgetState(projectRef: string, header = false) {
  const { actor, project, connections, empty, restricted, to } = await projectContext(projectRef);
  try {
    const concurrency = header ? 1 : 4;
    const namespace = meteringNamespace();
    const access: AccessContext = {
      namespace,
      readablePrincipals: [project.ownerId],
      readableGroups: [project.id],
      readablePools: [],
      canReadBillingDetail: true,
      canManageBudgets: false,
    };
    const { meter } = await meteringRuntime();
    const scope = { kind: "group" as const, namespace, group: project.id };
    const selected = connections.slice(0, connectionLimit);
    const refs = new Map(connections.map((connection) => [connection.id, connection.publicId]));
    const statuses = await readProjectBudgetStatuses(meter, access, project, selected, concurrency);
    const funding = await projectFundingStatuses(project.id, new Date(to));
    const split = funding.some(
      (status) => parseProjectFundingBudgetId(status.budget.id)?.fundingSource === "byok",
    );
    const primary = split ? await getRequestPrimarySerpProvider(project.id) : null;
    const budgetData = {
      ...empty,
      truncated: connections.length > connectionLimit,
      paidWorkBlocked: selectPaidWorkBlocked({
        split,
        primaryConnectionId: primary?.id ?? null,
        connectionCount: connections.length,
        connectionLimit,
        statuses,
      }),
    };
    if (restricted)
      return { data: { ...budgetData, status: "restricted" as const }, usageContext: null };
    const own = await mapAdminQueries(
      selected,
      (connection) =>
        readOwnConnectionBudgets({
          namespace,
          actorId: actor.id,
          projectId: project.id,
          connectionId: connection.id,
        }),
      concurrency,
    );
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
    const budgets: ProjectBudgetRow[] = [];
    const seen = new Set<string>();
    // Once split, the shared group budget is only an admission marker without a limit.
    for (const result of statuses)
      for (const status of result.statuses) {
        if (split && status.budget.id === projectBudgetId(project.id)) continue;
        if (parseProjectFundingBudgetId(status.budget.id)) continue;
        if (
          status.budget.scope.kind === "connection" &&
          own.some(
            (verified) =>
              verified !== null &&
              verified.binding.connection === result.connection?.id &&
              verified.binding.namespace === namespace &&
              verified.binding.principal === actor.id &&
              verified.binding.group === project.id &&
              verified.binding.publicConnection === result.connection?.publicId &&
              verified.binding.provider === result.connection?.provider &&
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
          result.connection?.publicId ?? null,
          projectBudgetFiguresKnown(status, operations, project.ownerId, completeProvenance),
          result.connection?.provider ?? null,
          undefined,
          result.connection
            ? [
                PROVIDER_CATALOG.find((p) => p.id === result.connection?.provider)?.label ??
                  result.connection.provider,
                project.name,
              ]
                .filter(Boolean)
                .join(" · ")
            : project.name,
          {
            projectName: project.name,
            connectionId: result.connection?.publicId,
            providerLabel: result.connection
              ? (PROVIDER_CATALOG.find((p) => p.id === result.connection?.provider)?.label ??
                result.connection.provider)
              : undefined,
          },
        );
        if (row) budgets.push(row);
      }
    for (const status of funding) {
      const row = projectBudgetRow(
        status,
        null,
        projectBudgetFiguresKnown(status, operations, project.ownerId, completeProvenance),
        null,
        undefined,
        project.name,
        { projectName: project.name },
      );
      if (row) budgets.push(row);
    }
    const platform = await readPlatformConnectionBudgets({
      namespace,
      actor,
      projectId: project.id,
      connections: selected,
    });
    for (const result of [...own, ...platform]) {
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
          [
            PROVIDER_CATALOG.find((p) => p.id === result.binding.provider)?.label ??
              result.binding.provider,
            project.name,
          ]
            .filter(Boolean)
            .join(" · "),
          {
            projectName: project.name,
            connectionId: result.binding.publicConnection,
            providerLabel:
              PROVIDER_CATALOG.find((p) => p.id === result.binding.provider)?.label ??
              result.binding.provider,
          },
        );
        if (row) budgets.push(row);
      }
    }
    return {
      data: {
        ...budgetData,
        status: "available" as const,
        budgets,
      },
      usageContext: { meter, access, scope, refs, owner: project.ownerId },
    };
  } catch {
    console.error("[metering] project usage unavailable");
    // A failed observer or authority read cannot turn missing data into a confirmed zero.
    return {
      data: { ...empty, status: restricted ? ("restricted" as const) : ("unavailable" as const) },
      usageContext: null,
    };
  }
}

// React cache supplies one holder per project/request, not a process-wide auth cache.
// A header reuses body work already in progress; it never starts a duplicate budget scan.
const requestBudgetRead = perRequestCache((_projectRef: string) => ({
  promise: undefined as ReturnType<typeof readProjectBudgetState> | undefined,
}));
function projectBudgetState(projectRef: string, header = false) {
  const holder = requestBudgetRead(projectRef);
  holder.promise ??= readProjectBudgetState(projectRef, header);
  return holder.promise;
}

/** Header and runs need budget evidence only, without usage pages or the pending scan. */
export const getProjectMeteringBudgets = perRequestCache(
  async (projectRef: string, mode: "default" | "header" = "default"): Promise<ProjectUsageViews> =>
    (await projectBudgetState(projectRef, mode === "header")).data,
);

export const getProjectMeteringUsage = perRequestCache(
  async (projectRef: string): Promise<ProjectUsageViews> => {
    const { data, usageContext } = await projectBudgetState(projectRef);
    if (!usageContext) return data;
    const { from, to, project } = await projectContext(projectRef);
    const { meter, access, scope, refs, owner } = usageContext;
    try {
      const [usage, pending] = await Promise.all([
        readOwnerUsage(meter, access, { scope, from, to }, owner, refs, async (ids) => {
          const current = await prisma.providerConnection.findMany({
            where: { projectId: project.id, id: { in: ids } },
            select: { id: true, publicId: true },
          });
          return new Map(current.map((connection) => [connection.id, connection.publicId]));
        }),
        meter.listOperations(access, {
          scope,
          from: "1970-01-01T00:00:00.000Z",
          to,
          states: ["reserved", "dispatch_intended", "pending"],
          limit: 100,
        }),
      ]);
      if (pending.outcome !== "ok") throw new Error("Meter read unavailable");
      const unresolved = pending.value.operations.filter(
        (operation) => operation.scope.principal === owner,
      );
      return {
        ...data,
        summary: usage.summary,
        detail: { ...usage.detail, nextCursor: null },
        unresolved: unresolved.length,
        oldestUnresolvedAt: unresolved[0]?.createdAt ?? null,
        truncated:
          data.truncated ||
          usage.truncated ||
          !usage.summary.complete ||
          Boolean(pending.value.nextCursor),
      };
    } catch {
      console.error("[metering] project usage unavailable");
      return { ...data, status: "unavailable" };
    }
  },
);
