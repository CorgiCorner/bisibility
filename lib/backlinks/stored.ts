import "server-only";

import { prisma } from "@/lib/db/prisma";
import { demoResearchFreshUntil, demoResearchStorageState } from "@/lib/demo/research-storage";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { BacklinkRowMode, BacklinkTargetScope } from "@/lib/providers/types";
import { normalizeBacklinksTarget } from "./target";
import type {
  BacklinksHistoryMonth,
  BacklinksRow,
  BacklinksSnapshot,
  BacklinksSummary,
} from "./types";

const MODE_KEY = "_mode";
const PROVIDER_KEY = "_provider";

type SnapshotWithRows = Prisma.BacklinkSnapshotGetPayload<{ include: { rows: true } }>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function snapshotMode(summary: unknown): BacklinkRowMode {
  return record(summary)[MODE_KEY] === "one_per_domain" ? "one_per_domain" : "as_is";
}

export function snapshotProvider(summary: unknown) {
  const provider = record(summary)[PROVIDER_KEY];
  return typeof provider === "string" && provider ? provider : "dataforseo";
}

function publicSummary(value: unknown): BacklinksSummary {
  const source = record(value);
  return {
    backlinksTotal: numeric(source.backlinksTotal),
    brokenBacklinks: numeric(source.brokenBacklinks),
    brokenPages: numeric(source.brokenPages),
    dofollowPct: numeric(source.dofollowPct),
    domainRank: numeric(source.domainRank),
    lostBacklinks: numeric(source.lostBacklinks),
    lostReferringDomains: numeric(source.lostReferringDomains),
    newBacklinks: numeric(source.newBacklinks),
    newReferringDomains: numeric(source.newReferringDomains),
    referringDomainsTotal: numeric(source.referringDomainsTotal),
    referringPages: numeric(source.referringPages),
    spamScore: numeric(source.spamScore),
  };
}

function publicHistory(value: unknown): BacklinksHistoryMonth[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item);
    if (typeof source.month !== "string") return [];
    return [
      {
        lostLinks: numeric(source.lostLinks),
        lostReferringDomains: numeric(source.lostReferringDomains),
        month: source.month,
        newLinks: numeric(source.newLinks),
        newReferringDomains: numeric(source.newReferringDomains),
      },
    ];
  });
}

function dateString(value: Date | string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function publicRow(row: SnapshotWithRows["rows"][number]): BacklinksRow {
  return {
    anchor: row.anchor,
    domainAuthority: row.domainAuthority,
    firstSeen: dateString(row.firstSeen),
    flags: row.flags.filter(
      (flag): flag is BacklinksRow["flags"][number] =>
        flag === "nofollow" ||
        flag === "ugc" ||
        flag === "sponsored" ||
        flag === "image" ||
        flag === "sitewide",
    ),
    linksCount: row.linksCount,
    lostAt: dateString(row.lostAt),
    sourceDomain: row.sourceDomain,
    sourceUrl: row.sourceUrl ?? "",
    spamScore: row.spamScore,
    status: row.status === "new" || row.status === "lost" ? row.status : "active",
    targetUrl: row.targetUrl,
  };
}

function visibleBacklinksRows(rows: BacklinksRow[], now: Date) {
  const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  return rows.filter(
    (row) =>
      row.status !== "lost" || (row.lostAt !== null && new Date(row.lostAt).getTime() >= cutoff),
  );
}

export function snapshotEnvelope(
  snapshot: SnapshotWithRows,
  input: { cached: boolean; costCents: number; now: Date; rows?: BacklinksRow[] },
): BacklinksSnapshot {
  const rows = input.rows ?? snapshot.rows.map(publicRow);
  return {
    cached: input.cached,
    cachedUntil: snapshot.expiresAt.toISOString(),
    costCents: input.costCents,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    fetchedRowCount: snapshot.fetchedRowCount,
    history: publicHistory(snapshot.history),
    includeSubdomains: snapshot.includeSubdomains,
    ok: true,
    provider: snapshotProvider(snapshot.summary),
    rows: visibleBacklinksRows(rows, input.now),
    summary: publicSummary(snapshot.summary),
    target: snapshot.target,
    targetScope: snapshot.targetScope === "page" ? "page" : "site",
    totalRowsAvailable: snapshot.totalRowsAvailable,
  };
}

export async function findStoredBacklinks(input: {
  includeSubdomains: boolean;
  mode: BacklinkRowMode;
  now?: Date;
  projectId: string;
  target: string;
  targetScope?: BacklinkTargetScope;
}) {
  const normalized = normalizeBacklinksTarget(input.target, input.targetScope);
  const snapshot = await prisma.backlinkSnapshot.findFirst({
    include: { rows: { orderBy: { id: "asc" } } },
    orderBy: { fetchedAt: "desc" },
    where: {
      includeSubdomains: normalized.scope === "site" ? input.includeSubdomains : false,
      projectId: input.projectId,
      summary: { equals: input.mode, path: [MODE_KEY] },
      target: normalized.target,
      targetScope: normalized.scope,
    },
  });
  if (!snapshot) return null;
  const freshUntil = demoResearchFreshUntil([snapshot.fetchedAt]);
  if (!freshUntil) return null;
  return {
    ...snapshotEnvelope(snapshot, { cached: true, costCents: 0, now: snapshot.fetchedAt }),
    ...demoResearchStorageState({ freshUntil, now: input.now, savedAt: snapshot.fetchedAt }),
  };
}

export async function listStoredBacklinks(input: { now?: Date; projectId: string }) {
  const snapshots = await prisma.backlinkSnapshot.findMany({
    orderBy: { fetchedAt: "desc" },
    select: {
      fetchedAt: true,
      includeSubdomains: true,
      summary: true,
      target: true,
      targetScope: true,
    },
    where: { projectId: input.projectId },
  });
  return snapshots.flatMap((snapshot) => {
    const freshUntil = demoResearchFreshUntil([snapshot.fetchedAt]);
    if (!freshUntil) return [];
    return [
      {
        includeSubdomains: snapshot.includeSubdomains,
        mode: snapshotMode(snapshot.summary),
        target: snapshot.target,
        targetScope: snapshot.targetScope === "page" ? "page" : "site",
        ...demoResearchStorageState({ freshUntil, now: input.now, savedAt: snapshot.fetchedAt }),
      },
    ];
  });
}
