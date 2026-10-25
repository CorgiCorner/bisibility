import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { providerRecoveryScope } from "@/lib/provider-evidence/recovery/scope";
import type { SummaryCheck } from "./aggregate";
import { type RoutingRun, routeCheckSummary } from "./routing";
import { SUMMARY_GRACE_MS, type SummaryWindow } from "./window";

export type SummaryTarget =
  | { kind: "scheduled"; projectId: string; window: SummaryWindow }
  | { kind: "manual"; projectId: string; runId: string };

export async function routingAncestors(tx: Prisma.TransactionClient, runs: readonly RoutingRun[]) {
  const map = new Map(runs.map((r) => [r.id, r]));
  let pending = runs
    .filter((r) => r.trigger === "retry" && r.parentRunId)
    .map((r) => r.parentRunId!);
  while (pending.length) {
    const ids = [...new Set(pending)].filter((id) => !map.has(id));
    if (!ids.length) break;
    const parents = await tx.rankCheckRun.findMany({ where: { id: { in: ids } } });
    for (const parent of parents) map.set(parent.id, parent);
    pending = parents
      .filter((r) => r.trigger === "retry" && r.parentRunId)
      .map((r) => r.parentRunId!);
  }
  return map;
}

const include = {
  keyword: { select: { publicId: true } },
  run: true,
  observationRun: true,
} as const;
type CollectedCheck = Prisma.RankCheckGetPayload<{ include: typeof include }>;

async function annotate(
  tx: Prisma.TransactionClient,
  rows: CollectedCheck[],
): Promise<SummaryCheck[]> {
  const candidates = await tx.providerRecoveryCandidate.findMany({
    where: {
      ...providerRecoveryScope(),
      rankCheckId: { in: rows.map((r) => r.id) },
      accountingOnly: false,
      intent: { accountingOnly: false },
    },
    select: { rankCheckId: true, operationPk: true },
  });
  const links = await tx.providerIncidentOperation.findMany({
    where: { operationPk: { in: candidates.map((c) => c.operationPk) } },
    select: { operationPk: true, incidentId: true },
  });
  return rows.map((row) => {
    // A fallback winner wins even before enqueue promotes the intent to accounting-only.
    const active =
      row.status === "completed" ? [] : candidates.filter((c) => c.rankCheckId === row.id);
    return {
      ...row,
      keywordPublicId: row.keyword.publicId,
      underReview: active.length > 0,
      incidentIds: links
        .filter((l) => active.some((c) => c.operationPk === l.operationPk))
        .map((l) => l.incidentId)
        .sort(),
    };
  });
}

export async function collectSummary(tx: Prisma.TransactionClient, target: SummaryTarget) {
  const run =
    target.kind === "manual"
      ? await tx.rankCheckRun.findUnique({ where: { id: target.runId } })
      : null;
  if (
    target.kind === "manual" &&
    (!run ||
      run.projectId !== target.projectId ||
      run.deletedAt ||
      !["completed", "cancelled"].includes(run.status) ||
      !run.finishedAt)
  )
    return null;
  const end = target.kind === "scheduled" ? target.window.end : run!.finishedAt!;
  const query = {
    where: {
      keyword: { projectId: target.projectId },
      status: { in: ["completed", "failed", "deferred"] },
      recoveryRestoredAt: null,
      terminalPersistedAt: { lt: new Date(end.getTime() + SUMMARY_GRACE_MS) },
      ...(target.kind === "manual"
        ? { runId: target.runId }
        : {
            OR: [
              { finishedAt: { gte: target.window.start, lt: end } },
              { finishedAt: null, checkedAt: { gte: target.window.start, lt: end } },
            ],
          }),
    },
    include,
  } satisfies Prisma.RankCheckFindManyArgs;
  let rows = await tx.rankCheck.findMany(query);
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM rank_checks WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`,
    );
    // Re-read after the lock: a concurrent fallback winner is never projected as recovery work.
    rows = await tx.rankCheck.findMany({
      ...query,
      where: { AND: [query.where, { id: { in: ids } }] },
    });
  }
  const ancestors = await routingAncestors(tx, [
    ...rows.flatMap((r) => (r.run ? [r.run] : [])),
    ...(run ? [run] : []),
  ]);
  const route = run ? routeCheckSummary(null, run, ancestors) : null;
  if (target.kind === "manual" && route?.kind !== "manual") return null;
  const routed = rows.filter(
    (r) => routeCheckSummary(r.trigger, r.run, ancestors).kind === target.kind,
  );
  const first =
    target.kind === "manual"
      ? await tx.rankCheck.aggregate({ where: { runId: target.runId }, _min: { checkedAt: true } })
      : null;
  const start = target.kind === "scheduled" ? target.window.start : (first?._min.checkedAt ?? end);
  const history = await tx.rankCheck.findMany({
    where: {
      keywordId: { in: [...new Set(routed.map((r) => r.keywordId))] },
      status: "completed",
      recoveryRestoredAt: null,
      ...(target.kind === "manual"
        ? { checkedAt: { lt: start }, OR: [{ runId: null }, { runId: { not: target.runId } }] }
        : { OR: [{ finishedAt: { lt: start } }, { finishedAt: null, checkedAt: { lt: start } }] }),
    },
    include,
  });
  return {
    end,
    start,
    checks: await annotate(tx, routed),
    history: await annotate(tx, history),
    requesterId: route?.kind === "manual" ? route.userId : null,
    runPublicId: run?.publicId ?? null,
  };
}
