import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type { AccessContext, Scope, Source } from "@usagekit/core";
import { budgetsViewFromStatuses, loadExceptionsView, loadUsageView } from "@usagekit/views";
import { mapAdminQueries } from "./admin-batch";
import type { MeteringAdminCursors, MeteringAdminData, MeteringAdminFilters } from "./admin-types";
import { platformAllocationTag } from "./paid-quote";
import { meteringNamespace, meteringRuntime } from "./runtime";

export async function readMeteringAdmin({
  month,
  project,
  actorId,
  usageCursor,
  exceptionCursor,
  exceptionTo,
}: MeteringAdminFilters & MeteringAdminCursors & { actorId?: string }): Promise<MeteringAdminData> {
  const { meter } = await meteringRuntime();
  const namespace = meteringNamespace();
  const access: AccessContext = {
    namespace,
    readablePrincipals: "*",
    readableGroups: "*",
    readablePools: "*",
    canReadBillingDetail: true,
    canManageBudgets: false,
  };
  const from = new Date(`${month}-01T00:00:00Z`),
    to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  const scope = project
    ? { kind: "group" as const, namespace, group: project }
    : { kind: "namespace" as const, namespace };
  const [usage, exceptions, connections, projects, projectChoices] = await Promise.all([
    loadUsageView(meter, access, {
      scope,
      from: from.toISOString(),
      to: to.toISOString(),
      units: ["cents", "units", "customer_cents", "requests"],
      groupBy: ["connection", "provider", "surface", "source"],
      limit: 100,
      ...(usageCursor ? { cursor: usageCursor } : {}),
    }),
    loadExceptionsView(meter, access, {
      scope,
      from: "1970-01-01T00:00:00.000Z",
      to: exceptionTo ?? new Date().toISOString(),
      limit: 100,
      ...(exceptionCursor ? { cursor: exceptionCursor } : {}),
    }),
    prisma.providerConnection.findMany({
      where: project ? { projectId: project } : {},
      select: {
        id: true,
        publicId: true,
        provider: true,
        projectId: true,
        project: { select: { ownerId: true, publicId: true } },
      },
      orderBy: { id: "asc" },
      take: 51,
    }),
    prisma.project.findMany({
      where: project ? { id: project } : {},
      select: { id: true, publicId: true, ownerId: true },
      orderBy: { id: "asc" },
      take: 51,
    }),
    prisma.project.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: 50 }),
  ]);
  if (
    usage.state === "unavailable" ||
    usage.state === "forbidden" ||
    exceptions.state === "unavailable" ||
    exceptions.state === "forbidden"
  )
    throw new Error("Meter unavailable");
  const scopes: Scope[] = [
    ...projects.slice(0, 50).map((project) => ({
      namespace,
      principal: project.ownerId,
      group: project.id,
      connection: "project-budget-observer",
    })),
    ...connections.slice(0, 50).map((connection) => ({
      namespace,
      principal: connection.project.ownerId,
      group: connection.projectId,
      connection: connection.id,
      tags: [
        ownAllocationTag(connection.provider, connection.id),
        platformAllocationTag(connection.provider, connection.id),
      ],
    })),
  ];
  const sources: Source[] = ["app", "worker", "api", "sdk", "cli", "mcp", "proxy"];
  const statuses = await mapAdminQueries(
    scopes.flatMap((scope) => sources.map((source) => ({ scope, source }))),
    async ({ scope, source }) => {
      const result = await meter.applicableBudgets(access, {
        scope,
        source,
        surface: source === "app" || source === "worker" ? "app" : "programmatic",
        units: ["cents", "units", "customer_cents", "requests", "budget_cents", "paid_attempts"],
      });
      if (result.outcome !== "ok") throw new Error("Meter budgets unavailable");
      return scope.connection === "project-budget-observer"
        ? result.value.filter((status) => status.budget.scope.kind === "group")
        : result.value;
    },
  );
  const unique = new Map(
    statuses.flat().map((status) => [`${status.budget.id}:${status.epoch.epoch}`, status]),
  );
  const budgetRows = budgetsViewFromStatuses([...unique.values()]).rows;
  // Resolve references independently of the capped budget scan, including retained history.
  const connectionIds = [
    ...new Set(
      [
        ...usage.rows.map((row) => row.dimensions.connection),
        ...exceptions.rows.map((row) => row.connection),
        ...budgetRows.filter((row) => row.kind === "connection").map((row) => row.target),
      ].filter(Boolean),
    ),
  ];
  const groupIds = [
    ...new Set(budgetRows.filter((row) => row.kind === "group").map((row) => row.target)),
  ];
  const [connectionRefs, groupRefs] = await Promise.all([
    connectionIds.length
      ? prisma.providerConnection.findMany({
          where: { id: { in: connectionIds } },
          select: {
            id: true,
            publicId: true,
            provider: true,
            projectId: true,
            project: { select: { publicId: true } },
          },
        })
      : [],
    groupIds.length
      ? prisma.project.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, publicId: true },
        })
      : [],
  ]);
  const publicConnections = new Map(connectionRefs.map((row) => [row.id, row.publicId]));
  const publicGroups = new Map(groupRefs.map((row) => [row.id, row.publicId]));
  const publicTags = new Map(
    connections.flatMap((connection) => [
      [ownAllocationTag(connection.provider, connection.id), connection.publicId],
      [platformAllocationTag(connection.provider, connection.id), connection.publicId],
    ]),
  );
  const references: NonNullable<MeteringAdminData["references"]> = {
    projects: {},
    connections: {},
  };
  const candidateIds = [
    ...new Set([
      ...projects.map((row) => row.id),
      ...groupRefs.map((row) => row.id),
      ...projectChoices.map((row) => row.id),
      ...connections.map((row) => row.projectId),
      ...connectionRefs.map((row) => row.projectId),
    ]),
  ];
  // Instance administration does not grant access to tenant project names.
  const readableProjects =
    actorId && candidateIds.length
      ? await prisma.project.findMany({
          where: {
            id: { in: candidateIds },
            OR: [{ ownerId: actorId }, { members: { some: { userId: actorId } } }],
          },
          select: { id: true, publicId: true, name: true },
        })
      : [];
  const readableNames = new Map(readableProjects.map((row) => [row.id, row.name]));
  const filterIds = new Set(projectChoices.map((row) => row.id));
  if (project) filterIds.add(project);
  for (const row of readableProjects) {
    if (row.publicId) references.projects[row.publicId] = row.name;
    if (filterIds.has(row.id)) references.projects[row.id] = row.name;
  }
  for (const row of [...connections, ...connectionRefs]) {
    if (!row.publicId || !row.project?.publicId) continue;
    references.connections[row.publicId] = {
      project: readableNames.get(row.projectId) ?? row.project.publicId,
      provider: row.provider,
    };
  }
  return {
    references,
    usage: {
      ...usage,
      watermark: null,
      rows: usage.rows.map((row, index) => ({
        ...row,
        key: `usage-${index}`,
        costOwner: "",
        dimensions: {
          connection: publicConnections.get(row.dimensions.connection) ?? "",
          provider: row.dimensions.provider ?? "",
          surface: row.dimensions.surface ?? "",
          source: row.dimensions.source ?? "",
        },
      })),
    },
    exceptions: {
      ...exceptions,
      rows: exceptions.rows.map((row) => ({
        ...row,
        principal: "",
        connection: publicConnections.get(row.connection) ?? "",
      })),
    },
    budgets: budgetRows.flatMap((row, index) => {
      const target =
        row.kind === "connection"
          ? publicConnections.get(row.target)
          : row.kind === "group"
            ? publicGroups.get(row.target)
            : row.kind === "tag"
              ? publicTags.get(row.target)
              : undefined;
      if (!target) return [];
      return [
        {
          ...row,
          kind: row.kind === "tag" ? ("connection" as const) : row.kind,
          id: `budget-${index}`,
          target,
          epoch: "",
        },
      ];
    }),
    projects: projectChoices.map((p) => p.id),
    truncated: connections.length > 50 || projects.length > 50,
  };
}
