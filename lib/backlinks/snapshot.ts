import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { BacklinkRowMode, BacklinkTargetScope } from "@/lib/providers/types";
import { backlinksCachedUntil } from "./cache";

export { snapshotEnvelope, snapshotMode, snapshotProvider } from "./stored";

import type { BacklinksHistoryMonth, BacklinksRow, BacklinksSummary } from "./types";

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

function snapshotLookupWhere(input: SnapshotLookupInput): Prisma.BacklinkSnapshotWhereInput {
  return {
    expiresAt: { gt: input.now },
    fetchedRowCount: { gte: input.minRows },
    includeSubdomains: input.includeSubdomains,
    projectId: input.projectId,
    summary: { equals: input.mode, path: ["_mode"] },
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
          _mode: input.mode,
          _provider: input.provider,
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
