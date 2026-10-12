type FrozenGroup = {
  credentialSource?: string;
  connectionId?: string;
  feature?: string;
  source?: string;
  trigger?: string;
  credentialId?: string | null;
  _sum?: { costCents?: unknown; priceCents?: unknown; usageQuantity?: unknown };
  _count?: { _all: number };
};
type FrozenAggregate = { _sum: { costCents?: unknown } };
/** Adapts frozen aggregate fixtures to SQL responses in projection-only unit tests.
 * Real scope, lineage and measurement queries are exercised separately against PostgreSQL.
 */
export async function frozenUsageResponse(
  query: { text: string; values: unknown[] },
  ledger: {
    aggregate?: (...args: unknown[]) => Promise<FrozenAggregate>;
    groupBy?: (...args: unknown[]) => Promise<FrozenGroup[]>;
  },
) {
  const aggregate: (...args: unknown[]) => Promise<FrozenAggregate> =
    ledger.aggregate ?? (async () => ({ _sum: { costCents: 0 } }));
  const groupBy: (...args: unknown[]) => Promise<FrozenGroup[]> =
    ledger.groupBy ?? (async () => []);
  if (query.text.includes('AS "ownCents"')) {
    const groups = await groupBy({ by: ["credentialSource"] });
    return [
      {
        ownCents: groups
          .filter((r: FrozenGroup) => r.credentialSource !== "hosted")
          .reduce((sum: number, r: FrozenGroup) => sum + Number(r._sum?.costCents ?? 0), 0),
        creditsCents: groups
          .filter((r: FrozenGroup) => r.credentialSource === "hosted")
          .reduce((sum: number, r: FrozenGroup) => sum + Number(r._sum?.priceCents ?? 0), 0),
      },
    ];
  }
  if (query.text.includes('AS "unrecordedCount"')) {
    const base = {
      cached: false,
      projectId: query.values.at(-3),
      createdAt: { gte: query.values.at(-2), lt: query.values.at(-1) },
    };
    const by = ["connectionId", "feature", "source", "trigger"];
    const confirmed = await groupBy({
      by,
      _count: { _all: true },
      _sum: { costCents: true, usageQuantity: true },
      where: { ...base, measurementStatus: "recorded" },
    });
    const unknown = await groupBy({
      by,
      _count: { _all: true },
      where: { ...base, measurementStatus: { not: "recorded" } },
    });
    const missing = await groupBy({
      by,
      _count: { _all: true },
      where: { ...base, measurementStatus: "recorded", usageQuantity: null },
    });
    const key = (r: FrozenGroup) => [r.connectionId, r.feature, r.source, r.trigger].join(":");
    const rows = [
      ...confirmed,
      ...unknown
        .filter((u: FrozenGroup) => !confirmed.some((c: FrozenGroup) => key(c) === key(u)))
        .map((u: FrozenGroup) => ({
          ...u,
          _count: { _all: 0 },
          _sum: { costCents: 0, usageQuantity: null },
        })),
    ];
    return rows.map((r: FrozenGroup) => ({
      connectionId: r.connectionId,
      feature: r.feature,
      source: r.source,
      count: r._count?._all ?? 0,
      costCents: r._sum?.costCents,
      quantity: r._sum?.usageQuantity,
      scheduled: r.trigger === "scheduled" ? (r._count?._all ?? 0) : 0,
      unrecordedCount: unknown.find((u: FrozenGroup) => key(u) === key(r))?._count?._all ?? 0,
      unmeasuredCount: missing.find((u: FrozenGroup) => key(u) === key(r))?._count?._all ?? 0,
    }));
  }
  if (query.text.includes('GROUP BY "credentialId"')) {
    const groups = await groupBy({ by: ["credentialId"] });
    return groups
      .filter((r: FrozenGroup) => r.credentialId)
      .map((r: FrozenGroup) => ({ credentialId: r.credentialId, total: r._sum?.costCents ?? 0 }));
  }
  if (query.text.includes("AS total")) {
    const result = await aggregate({
      _sum: { costCents: true },
      where: {
        cached: false,
        createdAt: { gte: query.values.at(-2), lt: query.values.at(-1) },
        measurementStatus: "recorded",
        projectId: query.values.at(-3),
      },
    });
    return [{ total: result._sum.costCents ?? 0 }];
  }
  return [];
}
