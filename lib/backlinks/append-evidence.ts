import "server-only";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { actionPaymentReceiptSchema } from "@/lib/action-payment/schema";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { appendSummary } from "./append-claim";
import { BacklinksSnapshotExpiredError } from "./errors";
import type { BacklinksRow } from "./types";

type Snapshot = Prisma.BacklinkSnapshotGetPayload<object>;
const finite = z.number().finite();
const pageSchema = z.object({
  payment: actionPaymentReceiptSchema.optional(),
  costCents: finite.nonnegative(),
  totalCount: finite.int().nonnegative(),
  rows: z.array(
    z.object({
      anchor: z.string(),
      domainAuthority: finite,
      firstSeen: z.string().nullable(),
      flags: z.array(z.enum(["nofollow", "ugc", "sponsored", "image", "sitewide"])),
      linksCount: finite,
      lostAt: z.string().nullable(),
      sourceDomain: z.string(),
      sourceUrl: z.string(),
      spamScore: finite,
      status: z.enum(["active", "new", "lost"]),
      targetUrl: z.string(),
    }),
  ),
});
export type AppendPage = {
  payment?: ActionPaymentReceipt;
  costCents: number;
  totalCount: number;
  rows: BacklinksRow[];
};
export type AppendClaim = { token: string; summary: Prisma.InputJsonObject };

export function retainedBacklinksPage(snapshot: Snapshot) {
  const summary = appendSummary(snapshot.summary);
  if (!summary._appendPage) return null;
  const parsed = pageSchema.safeParse(summary._appendPage);
  if (!parsed.success || typeof summary._appendPending !== "string")
    throw new BacklinksSnapshotExpiredError();
  return { page: parsed.data, claim: { token: summary._appendPending, summary } };
}

/** Keeps normalized product evidence independently of the final row-append transaction. */
export async function retainBacklinksPage(
  snapshot: Snapshot,
  claim: AppendClaim,
  page: AppendPage,
) {
  const value = pageSchema.parse(page);
  const summary = { ...claim.summary, _appendPage: value } as unknown as Prisma.InputJsonObject;
  const saved = await prisma.backlinkSnapshot.updateMany({
    where: {
      id: snapshot.id,
      projectId: snapshot.projectId,
      fetchedRowCount: snapshot.fetchedRowCount,
      summary: { equals: claim.summary },
    },
    data: { summary },
  });
  if (saved.count !== 1) throw new BacklinksSnapshotExpiredError();
  return { token: claim.token, summary };
}

export function completedAppendSummary(snapshot: Snapshot) {
  const { _appendPending, _appendPage, ...summary } = appendSummary(snapshot.summary);
  return summary;
}
