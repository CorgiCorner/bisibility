import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { BacklinksSnapshotExpiredError } from "./errors";

type Snapshot = Prisma.BacklinkSnapshotGetPayload<object>;
export function appendSummary(summary: unknown): Prisma.JsonObject {
  return summary && typeof summary === "object" && !Array.isArray(summary)
    ? (summary as Prisma.JsonObject)
    : {};
}

/** A failed or uncertain paid append stays fenced until the user creates a fresh analysis. */
export async function claimBacklinksAppend(snapshot: Snapshot) {
  const summary = appendSummary(snapshot.summary);
  if (summary._appendPending) throw new BacklinksSnapshotExpiredError();
  const token = randomUUID();
  const pending = { ...summary, _appendPending: token };
  const result = await prisma.backlinkSnapshot.updateMany({
    where: {
      id: snapshot.id,
      projectId: snapshot.projectId,
      fetchedRowCount: snapshot.fetchedRowCount,
      summary: { equals: summary },
    },
    data: { summary: pending },
  });
  if (result.count !== 1) throw new BacklinksSnapshotExpiredError();
  return { token, summary: pending };
}

export async function releaseUnsentBacklinksAppend(
  snapshot: Snapshot,
  claim: { summary: Prisma.InputJsonObject },
) {
  await prisma.backlinkSnapshot.updateMany({
    where: {
      id: snapshot.id,
      projectId: snapshot.projectId,
      fetchedRowCount: snapshot.fetchedRowCount,
      summary: { equals: claim.summary },
    },
    data: { summary: snapshot.summary as Prisma.InputJsonObject },
  });
}
