import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { settleSiteAuditCrawl } from "./budget-extension";
import { saveSiteAuditSummary } from "./report-store";
import type { CrawlProgress, CrawlState, CrawlStopReason, CrawlStore } from "./run-contract";

const LEASE_MS = 90_000;
export const urlHash = (url: string) => createHash("sha256").update(url).digest("hex");
const state = (row: {
  state: string;
  pagesCrawled: number;
  stopReason: string | null;
}): CrawlProgress => ({
  state: row.state as CrawlState,
  pagesCrawled: row.pagesCrawled,
  stopReason: row.stopReason as CrawlStopReason | null,
});

export function createCrawlStore(db: PrismaClient, generation?: number): CrawlStore {
  async function release(id: string, token: string) {
    await db.siteAuditRun.updateMany({
      where: {
        id,
        ...(generation === undefined ? {} : { generation }),
        state: "running",
        leaseToken: token,
      },
      data: { leaseToken: null, leaseExpiresAt: null },
    });
  }

  return {
    async claim(id) {
      const row = await db.siteAuditRun.findUniqueOrThrow({ where: { id } });
      if (generation !== undefined && row.generation !== generation)
        return { state: "cancelled", pagesCrawled: row.pagesCrawled, stopReason: "cancelled" };
      const now = new Date();
      const token = randomUUID();
      const acquired = await db.siteAuditRun.updateMany({
        where: {
          id,
          ...(generation === undefined ? {} : { generation }),
          state: { in: ["queued", "running"] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        data: {
          state: "running",
          leaseToken: token,
          leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
          lastHeartbeatAt: now,
        },
      });
      if (!acquired.count) return state(await db.siteAuditRun.findUniqueOrThrow({ where: { id } }));
      try {
        await db.siteAuditRun.updateMany({
          where: { id, leaseToken: token, startedAt: null },
          data: { startedAt: now },
        });
        const current = await db.siteAuditRun.findUniqueOrThrow({ where: { id } });
        if (current.leaseToken !== token || current.state !== "running") return state(current);
        return {
          id,
          projectId: current.projectId,
          target: current.target,
          token,
          requestedPages: current.requestedPages,
          budgetPages: current.budgetPages,
          priority: current.priority,
          pagesCrawled: current.pagesCrawled,
        };
      } catch (error) {
        try {
          await release(id, token);
        } catch (releaseError) {
          throw new AggregateError(
            [error, releaseError],
            "Site audit failed and lease release failed.",
          );
        }
        throw error;
      }
    },
    release: (claim) => release(claim.id, claim.token),
    async limit(claim, budget) {
      const update = await db.siteAuditRun.updateMany({
        where: {
          id: claim.id,
          state: "running",
          leaseToken: claim.token,
          leaseExpiresAt: { gt: new Date() },
        },
        data: { budgetPages: budget.maxPages, priority: budget.priority },
      });
      if (!update.count) throw new Error("Site audit lease expired.");
    },
    async next(claim) {
      return db.siteAuditFrontier.findFirst({
        where: { runId: claim.id, state: "queued" },
        orderBy: [{ depth: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { url: true, depth: true },
      });
    },
    async save({ claim, entry, page, discovered, requests }) {
      return db.$transaction(async (tx) => {
        const now = new Date();
        const owned = await tx.siteAuditRun.updateMany({
          where: {
            id: claim.id,
            state: "running",
            leaseToken: claim.token,
            leaseExpiresAt: { gt: now },
          },
          data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS), lastHeartbeatAt: now },
        });
        if (!owned.count) return false;
        const current = await tx.siteAuditRun.findUniqueOrThrow({
          where: { id: claim.id },
          select: { pagesCrawled: true, budgetPages: true },
        });
        if (current.pagesCrawled >= current.budgetPages) return false;
        const frontier = await tx.siteAuditFrontier.updateMany({
          where: { runId: claim.id, urlHash: urlHash(entry.url), state: "queued" },
          data: { state: "done" },
        });
        if (!frontier.count) return false;
        const inserted = await tx.siteAuditPage.createMany({
          data: [
            {
              runId: claim.id,
              urlHash: urlHash(entry.url),
              ordinal: current.pagesCrawled + 1,
              facts: page as unknown as Prisma.InputJsonValue,
            },
          ],
          skipDuplicates: true,
        });
        if (!inserted.count) return false;
        if (page.finalUrl !== entry.url)
          await tx.siteAuditFrontier.upsert({
            where: { runId_urlHash: { runId: claim.id, urlHash: urlHash(page.finalUrl) } },
            create: {
              runId: claim.id,
              url: page.finalUrl,
              urlHash: urlHash(page.finalUrl),
              depth: entry.depth,
              state: "done",
            },
            update: { state: "done" },
          });
        if (discovered.length)
          await tx.siteAuditFrontier.createMany({
            data: discovered.map((url) => ({
              runId: claim.id,
              url,
              urlHash: urlHash(url),
              depth: entry.depth + 1,
            })),
            skipDuplicates: true,
          });
        await tx.siteAuditRun.update({
          where: { id: claim.id },
          data: { pagesCrawled: { increment: 1 }, requests: { increment: requests } },
        });
        return true;
      });
    },
    async finish(claim, reason, requests) {
      return db.$transaction(async (tx) => {
        const now = new Date();
        const terminal = reason !== "batch";
        const nextState =
          reason === "finished"
            ? "complete"
            : reason === "batch"
              ? "running"
              : reason === "error"
                ? "failed"
                : reason === "cancelled"
                  ? "cancelled"
                  : "stopped";
        const updated = await tx.siteAuditRun.updateMany({
          where: {
            id: claim.id,
            state: "running",
            leaseToken: claim.token,
            leaseExpiresAt: { gt: now },
          },
          data: {
            state: nextState,
            stopReason: terminal ? reason : null,
            leaseToken: null,
            leaseExpiresAt: null,
            requests: { increment: requests },
            lastHeartbeatAt: now,
            ...(terminal ? { completedAt: now } : {}),
          },
        });
        const run = await tx.siteAuditRun.findUniqueOrThrow({ where: { id: claim.id } });
        if (updated.count && terminal) {
          await saveSiteAuditSummary(tx, run);
          await settleSiteAuditCrawl(tx, claim.id);
        }
        return state(run);
      });
    },
  };
}
