import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AccessContext } from "@usagekit/core";
import { mapAdminQueries } from "./admin-batch";
import { exactAmount, quantityLabel } from "./admin-format";
import { legacySourceSurfaceSql } from "./admin-surface-sql";
import type {
  MeteringAdminData,
  MeteringAdminFilters,
  MeteringBudgetRow,
  MeteringExceptionRow,
  MeteringUsageRow,
} from "./admin-types";
import { decimalQuantity } from "./mapping";
import { meteringNamespace, meteringRuntime } from "./runtime";
import { Prisma } from "./store/sql";

export async function readMeteringAdmin({
  month,
  project,
}: MeteringAdminFilters): Promise<MeteringAdminData> {
  const { meter } = await meteringRuntime(),
    namespace = meteringNamespace();
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
  const projectFilter = project ? Prisma.sql`AND "projectId"=${project}` : Prisma.empty;
  const [meterPage, legacy, connections, exceptions, disagreements, projects] = await Promise.all([
    meter.usage(access, {
      scope: project
        ? { kind: "group", namespace, group: project }
        : { kind: "namespace", namespace },
      from: from.toISOString(),
      to: to.toISOString(),
      units: ["cents", "units"],
      groupBy: ["connection", "surface"],
      limit: 100,
    }),
    prisma.$queryRaw<
      { connection: string; surface: string; funding: string; cost: string }[]
    >(Prisma.sql`
      SELECT "connectionId" AS connection,${legacySourceSurfaceSql} AS surface,
      CASE WHEN "credentialSource"='hosted' THEN 'platform' ELSE 'byok' END AS funding,
      sum("costCents")::text AS cost
      FROM provider_cost_entries WHERE "createdAt">=${from} AND "createdAt"<${to}
      AND "credentialSource" IN ('own','hosted') AND "measurementStatus"='recorded' ${projectFilter}
      GROUP BY 1,2,3 ORDER BY 1,2,3 LIMIT 101`),
    prisma.providerConnection.findMany({
      where: project ? { projectId: project } : {},
      select: { id: true, projectId: true, project: { select: { ownerId: true } } },
      orderBy: { id: "asc" },
      take: 51,
    }),
    prisma.$queryRaw<MeteringExceptionRow[]>(Prisma.sql`
      SELECT operation_id AS id,operation_id AS operation,state,updated_at::text AS "updatedAt" FROM metering_operation
      WHERE namespace=${namespace} ${project ? Prisma.sql`AND input->'scope'->>'group'=${project}` : Prisma.empty}
        AND (state='pending' OR (state='dispatch_intended' AND lease_expires_at<=now()) OR (state='reserved' AND reservation_expires_at<=now()))
      UNION ALL SELECT 'error:'||operation_id,operation_id,'shadow_error',updated_at::text FROM metering_shadow
      WHERE namespace=${namespace} AND failures>0 ${project ? Prisma.sql`AND project_id=${project}` : Prisma.empty}
      ORDER BY "updatedAt" DESC LIMIT 51`),
    prisma.$queryRaw<
      { count: bigint }[]
    >(Prisma.sql`SELECT count(*) AS count FROM metering_shadow WHERE namespace=${namespace} AND created_at>=now()-interval '7 days'
      AND operation_id LIKE 'admission:%' AND ((legacy='allowed' AND meter='exceeded') OR (legacy='blocked' AND meter='reserved')) ${project ? Prisma.sql`AND project_id=${project}` : Prisma.empty}`),
    prisma.project.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: 50 }),
  ]);
  if (meterPage.outcome !== "ok") throw new Error("Meter usage unavailable");
  const usage = new Map<string, MeteringUsageRow>();
  for (const row of legacy.slice(0, 100)) {
    const id = `${row.connection}:${row.surface}:${row.funding}`;
    usage.set(id, {
      id,
      connection: row.connection,
      surface: row.surface,
      funding: row.funding,
      meter: null,
      reserved: null,
      legacy: row.cost,
      difference: null,
      certainty: "unavailable",
    });
  }
  for (const row of meterPage.value.rows) {
    const connection = row.dimensions.connection ?? "unknown",
      surface = row.dimensions.surface ?? "unknown",
      funding = row.fundingSource,
      id = `${connection}:${surface}:${funding}`;
    const prior = usage.get(id),
      money = row.cost.money?.units;
    usage.set(id, {
      id,
      connection,
      surface,
      funding,
      meter: money === undefined ? null : exactAmount(money, 4),
      reserved: null,
      legacy: prior?.legacy ?? null,
      difference:
        money !== undefined && prior?.legacy !== null && prior?.legacy !== undefined
          ? exactAmount(money - decimalQuantity(prior.legacy, "cents", 4).value, 4)
          : null,
      certainty: row.cost.certainty,
    });
  }
  const budgets: MeteringBudgetRow[] = [];
  const inquiries = connections
    .slice(0, 50)
    .flatMap((connection) =>
      (["app", "programmatic"] as const).map((surface) => ({ connection, surface })),
    );
  const budgetStatuses = await mapAdminQueries(inquiries, async ({ connection, surface }) => {
    const statuses = await meter.applicableBudgets(access, {
      scope: {
        namespace,
        principal: connection.project.ownerId,
        group: connection.projectId,
        connection: connection.id,
      },
      surface,
      units: ["cents", "units"],
    });
    if (statuses.outcome !== "ok") throw new Error("Meter budgets unavailable");
    return { connection, surface, statuses: statuses.value };
  });
  for (const { connection, surface, statuses } of budgetStatuses) {
    for (const s of statuses) {
      if (s.budget.scope.kind !== "connection") continue;
      budgets.push({
        id: `${s.budget.id}:${surface}`,
        connection: connection.id,
        surface,
        used: quantityLabel(s.used),
        reserved: quantityLabel(s.reserved),
        remaining: s.budget.limit === null ? "unlimited" : quantityLabel(s.remaining),
        resetsAt: s.epoch.endsAt,
      });
      // A connection funds through exactly one source, so its budget matches that row.
      const row =
        usage.get(`${connection.id}:${surface}:byok`) ??
        usage.get(`${connection.id}:${surface}:platform`);
      if (row && s.budget.unit === "cents" && from.toISOString() === s.epoch.startsAt)
        row.reserved = quantityLabel(s.reserved);
    }
  }
  return {
    usage: [...usage.values()].slice(0, 100),
    budgets,
    exceptions: exceptions.slice(0, 50),
    projects: projects.map((p) => p.id),
    disagreements: String(disagreements[0]?.count ?? 0n),
    truncated:
      Boolean(meterPage.value.nextCursor) ||
      legacy.length > 100 ||
      usage.size > 100 ||
      connections.length > 50 ||
      exceptions.length > 50,
  };
}
