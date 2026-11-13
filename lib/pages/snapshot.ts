import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { emitSignal } from "@/lib/signals/emit";
import { SIGNAL_TYPES } from "@/lib/signals/types";
import { PageSnapshotConflictError } from "./snapshot-errors";
import { utcDateKey } from "./snapshot-series";
import type { ActivePageSnapshot, TakePageSnapshotResult } from "./snapshot-view";

const CHUNK = 1_000;

function dateOnly(value: Date) {
  return new Date(`${utcDateKey(value)}T00:00:00.000Z`);
}

async function sourceKind(projectId: string) {
  const sitemap = await prisma.projectPageSource.findFirst({
    select: { id: true },
    where: { page: { projectId }, source: "sitemap" },
  });
  return sitemap ? ("sitemap" as const) : ("registry" as const);
}

async function listedPageIds(projectId: string) {
  const source = await sourceKind(projectId);
  if (source === "registry") {
    const pages = await prisma.projectPage.findMany({ select: { id: true }, where: { projectId } });
    return { ids: pages.map((page) => page.id), source };
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT page.id
    FROM "project_pages" page
    JOIN "project_page_sources" source ON source."pageId" = page.id
    WHERE page."projectId" = ${projectId}
      AND source.source = 'sitemap'::"ProjectPageSourceKind"
      AND source.detail->>'listed' = 'true'
  `;
  return { ids: rows.map((row) => row.id), source };
}

async function ownedPageIds(projectId: string, pageIds: readonly string[]) {
  if (pageIds.length === 0) return [];
  const rows = await prisma.projectPage.findMany({
    select: { id: true },
    where: { id: { in: [...pageIds] }, projectId },
  });
  return rows.map((row) => row.id);
}

export async function takePageSnapshot(input: {
  actorId: string;
  confirm?: boolean;
  label?: string;
  now?: Date;
  pageIds?: readonly string[];
  projectId: string;
  takenOn?: Date;
}): Promise<TakePageSnapshotResult> {
  const now = input.now ?? new Date();
  const takenOn = dateOnly(input.takenOn ?? now);
  const label = input.label?.trim() || "Day 1";
  const active = await prisma.pageSnapshot.findFirst({
    select: { pageCount: true, takenOn: true },
    where: { archivedAt: null, projectId: input.projectId },
  });
  if (active && input.confirm !== true) {
    return {
      pageCount: active.pageCount,
      status: "needs_confirmation",
      takenOn: utcDateKey(active.takenOn),
    };
  }
  const membership = input.pageIds
    ? {
        ids: await ownedPageIds(input.projectId, input.pageIds),
        source: await sourceKind(input.projectId),
      }
    : await listedPageIds(input.projectId);
  try {
    return await writeSnapshot({
      ...input,
      active: Boolean(active),
      label,
      membership,
      now,
      takenOn,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PageSnapshotConflictError();
    }
    throw error;
  }
}

async function writeSnapshot(input: {
  active: boolean;
  actorId: string;
  label: string;
  membership: { ids: string[]; source: "registry" | "sitemap" };
  now: Date;
  projectId: string;
  takenOn: Date;
}): Promise<TakePageSnapshotResult> {
  const created = await prisma.$transaction(async (tx) => {
    if (input.active) {
      await tx.pageSnapshot.updateMany({
        data: { archivedAt: input.now },
        where: { archivedAt: null, projectId: input.projectId },
      });
    }
    const signal = await emitSignal(
      {
        createdById: input.actorId,
        happenedAt: new Date(`${utcDateKey(input.takenOn)}T12:00:00.000Z`),
        payload: { note: `${input.label} snapshot: ${input.membership.ids.length} pages` },
        projectId: input.projectId,
        severity: "info",
        source: "manual",
        type: SIGNAL_TYPES.note,
      },
      tx,
    );
    const snapshot = await tx.pageSnapshot.create({
      data: {
        createdById: input.actorId,
        label: input.label,
        pageCount: input.membership.ids.length,
        projectId: input.projectId,
        signalId: signal.id,
        source: input.membership.source,
        takenOn: input.takenOn,
      },
      select: { id: true, label: true, pageCount: true, source: true, takenOn: true },
    });
    for (let index = 0; index < input.membership.ids.length; index += CHUNK) {
      const chunk = input.membership.ids.slice(index, index + CHUNK);
      if (chunk.length === 0) continue;
      await tx.pageSnapshotPage.createMany({
        data: chunk.map((pageId) => ({ pageId, snapshotId: snapshot.id })),
      });
    }
    return { signal, snapshot };
  });
  const snapshot: ActivePageSnapshot = {
    id: created.snapshot.id,
    label: created.snapshot.label,
    pageCount: created.snapshot.pageCount,
    signalPublicId: created.signal.publicId,
    source: created.snapshot.source,
    takenOn: utcDateKey(created.snapshot.takenOn),
  };
  return { replaced: input.active, snapshot, status: "taken" };
}

/** Reads the page list a baseline would hold. Run it before the write transaction. */
export async function baselinePageMembership(projectId: string) {
  return listedPageIds(projectId);
}

/**
 * Writes the project's page list as a baseline owned by its caller, such as a
 * challenge enrollment, inside the caller's transaction. The row is written
 * already archived, so it never becomes or replaces the active comparison
 * snapshot in Pages, and later Pages snapshots never change it. No timeline
 * note is added.
 */
export async function writeBaselinePageSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    label: string;
    membership: Awaited<ReturnType<typeof baselinePageMembership>>;
    now: Date;
    projectId: string;
    /** Local day key (YYYY-MM-DD) the baseline belongs to. */
    takenOn: string;
  },
) {
  const snapshot = await tx.pageSnapshot.create({
    data: {
      archivedAt: input.now,
      createdById: input.actorId,
      label: input.label,
      pageCount: input.membership.ids.length,
      projectId: input.projectId,
      source: input.membership.source,
      takenOn: new Date(`${input.takenOn}T00:00:00.000Z`),
    },
    select: { id: true },
  });
  for (let index = 0; index < input.membership.ids.length; index += CHUNK) {
    const chunk = input.membership.ids.slice(index, index + CHUNK);
    if (chunk.length === 0) continue;
    await tx.pageSnapshotPage.createMany({
      data: chunk.map((pageId) => ({ pageId, snapshotId: snapshot.id })),
    });
  }
  return snapshot;
}
