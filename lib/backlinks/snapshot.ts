import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { BacklinkRowMode, BacklinkTargetScope } from "@/lib/providers/types";
import { backlinksCachedUntil } from "./cache";
import type {
  BacklinksHistoryMonth,
  BacklinksRow,
  BacklinksSnapshot,
  BacklinksSummary,
} from "./types";

const MODE_KEY = "_mode";
const PROVIDER_KEY = "_provider";

type SnapshotWithRows = Prisma.BacklinkSnapshotGetPayload<{ include: { rows: true } }>;
type SnapshotRecord = Prisma.BacklinkSnapshotGetPayload<object>;
type SnapshotLookupInput = {
  includeSubdomains: boolean;
  minRows: number;
  mode: BacklinkRowMode;
  now: Date;
  projectId: string;
  scope: BacklinkTargetScope;
  target: string;
};

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
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
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
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).getTime();
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

function snapshotLookupWhere(input: SnapshotLookupInput): Prisma.BacklinkSnapshotWhereInput {
  return {
    expiresAt: { gt: input.now },
    fetchedRowCount: { gte: input.minRows },
    includeSubdomains: input.includeSubdomains,
    projectId: input.projectId,
    summary: { equals: input.mode, path: [MODE_KEY] },
    target: input.target,
    targetScope: input.scope,
  };
}

export function findBacklinksSnapshotMetadata(input: SnapshotLookupInput) {
  return prisma.backlinkSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { expiresAt: true, fetchedAt: true },
    where: snapshotLookupWhere(input),
  });
}

export function findBacklinksSnapshot(input: SnapshotLookupInput) {
  const cutoff = new Date(input.now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return prisma.backlinkSnapshot.findFirst({
    include: {
      rows: {
        orderBy: { id: "asc" },
        where: { OR: [{ status: { not: "lost" } }, { lostAt: { gte: cutoff } }] },
      },
    },
    orderBy: { fetchedAt: "desc" },
    where: snapshotLookupWhere(input),
  });
}

function rowData(row: BacklinksRow) {
  return {
    anchor: row.anchor,
    domainAuthority: row.domainAuthority,
    firstSeen: row.firstSeen ? new Date(row.firstSeen) : null,
    flags: row.flags,
    linksCount: row.linksCount,
    lostAt: row.lostAt ? new Date(row.lostAt) : null,
    sourceDomain: row.sourceDomain,
    sourceUrl: row.sourceUrl,
    spamScore: row.spamScore,
    status: row.status,
    targetUrl: row.targetUrl,
  };
}

export async function persistBacklinksSnapshot(input: {
  costCents: number;
  fetchedAt: Date;
  history: BacklinksHistoryMonth[];
  includeSubdomains: boolean;
  mode: BacklinkRowMode;
  projectId: string;
  provider: string;
  rows: BacklinksRow[];
  scope: BacklinkTargetScope;
  summary: BacklinksSummary;
  target: string;
  totalRowsAvailable: number;
}) {
  const expiresAt = new Date(backlinksCachedUntil(input.fetchedAt));
  return prisma.$transaction((tx) =>
    tx.backlinkSnapshot.create({
      data: {
        costCents: input.costCents,
        expiresAt,
        fetchedAt: input.fetchedAt,
        fetchedRowCount: input.rows.length,
        history: input.history as Prisma.InputJsonValue,
        includeSubdomains: input.includeSubdomains,
        projectId: input.projectId,
        rows: { create: input.rows.map(rowData) },
        summary: {
          ...input.summary,
          [MODE_KEY]: input.mode,
          [PROVIDER_KEY]: input.provider,
        } as Prisma.InputJsonObject,
        target: input.target,
        targetScope: input.scope,
        totalRowsAvailable: input.totalRowsAvailable,
      },
      include: { rows: true },
    }),
  );
}

export function findCurrentBacklinksSnapshot(input: {
  includeSubdomains: boolean;
  now: Date;
  projectId: string;
  scope: BacklinkTargetScope;
  target: string;
}) {
  return prisma.backlinkSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
    where: {
      expiresAt: { gt: input.now },
      includeSubdomains: input.includeSubdomains,
      projectId: input.projectId,
      target: input.target,
      targetScope: input.scope,
    },
  });
}

export async function appendBacklinksRows(input: {
  costCents: number;
  rows: BacklinksRow[];
  snapshot: SnapshotRecord;
}) {
  return prisma.$transaction(async (tx) => {
    if (input.rows.length > 0) {
      await tx.backlinkRow.createMany({
        data: input.rows.map((row) => ({ ...rowData(row), snapshotId: input.snapshot.id })),
      });
    }
    return tx.backlinkSnapshot.update({
      data: {
        costCents: { increment: input.costCents },
        fetchedRowCount: { increment: input.rows.length },
      },
      where: { id: input.snapshot.id },
    });
  });
}
