import { describe, expect, it, vi } from "vitest";
import { claimDueRankCheckItems } from "./items-claim";
import { createClaimFixture, publicId, RUN_PUBLIC_ID } from "./items-claim.postgres-fixtures";

vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: vi.fn(async () => undefined),
}));

describe("first target claim SQL", () => {
  it("claims queued runs only when due and never resets the first execution time", async () => {
    const { database, db, query } = await createClaimFixture();
    try {
      await db.exec(`
        INSERT INTO projects VALUES ('project', 'example.com');
        INSERT INTO project_markets VALUES ('pm-active', 'project', 'market', 'active');
        INSERT INTO keywords (id, "publicId", "projectId", "locationId", device, "archivedAt")
          VALUES ('kw1', '${publicId("kw", "kw1")}', 'project', 'market', 'desktop', NULL);
        INSERT INTO rank_check_runs (id, "publicId", "projectId", "requestedCount",
          "selectionKind", status, "startedAt")
          VALUES ('run', '${RUN_PUBLIC_ID}', 'project', 1, 'scheduled_due', 'queued', NULL);
        INSERT INTO rank_check_run_items (id, "runId", "keywordId", status, "notBefore")
          VALUES ('item', 'run', 'kw1', 'queued', '2026-09-04 14:00Z');
      `);
      expect(
        (await claimDueRankCheckItems({ now: new Date("2026-09-04T10:00:00Z") }, database as never))
          .claimed,
      ).toBe(0);
      expect(await query('SELECT status, "startedAt" FROM rank_check_runs')).toEqual([
        { status: "queued", startedAt: null },
      ]);
      const first = new Date("2026-09-04T14:00:00Z");
      expect((await claimDueRankCheckItems({ now: first }, database as never)).claimed).toBe(1);
      expect(await query('SELECT status, "startedAt" FROM rank_check_runs')).toEqual([
        { status: "running", startedAt: first },
      ]);
      await db.exec(`UPDATE rank_check_run_items SET status = 'completed';
        INSERT INTO rank_check_run_items (id, "runId", "keywordId", status, "notBefore")
          VALUES ('second', 'run', 'kw1', 'queued', '2026-09-04 15:00Z');`);
      expect(
        (await claimDueRankCheckItems({ now: new Date("2026-09-04T15:00:00Z") }, database as never))
          .claimed,
      ).toBe(1);
      expect(await query('SELECT "startedAt" FROM rank_check_runs')).toEqual([
        { startedAt: first },
      ]);
    } finally {
      await db.close();
    }
  });

  it("cancels scheduled rows whose market is archived after enqueue", async () => {
    const { audits, database, db, query } = await createClaimFixture();
    try {
      await db.exec(`
        INSERT INTO projects VALUES ('project', 'example.com');
        INSERT INTO project_markets VALUES
          ('pm-active', 'project', 'active-market', 'active'),
          ('pm-archived', 'project', 'archived-market', 'active');
        INSERT INTO keywords (id, "publicId", "projectId", "locationId", device, "archivedAt")
          VALUES
            ('kw-runnable', '${publicId("kw", "kwrunnable")}', 'project', 'active-market',
              'desktop', NULL),
            ('kw-archived-market', '${publicId("kw", "kwarchivedmarket")}', 'project', 'archived-market',
              'desktop', NULL),
            ('kw-archived', '${publicId("kw", "kwarchived")}', 'project', 'active-market',
              'desktop', '2026-09-03 09:00Z');
        INSERT INTO rank_check_runs (id, "publicId", "projectId", "requestedCount",
          "selectionKind", trigger, status, "startedAt")
          VALUES ('run', '${RUN_PUBLIC_ID}', 'project', 3, 'scheduled_due', 'scheduled', 'queued', NULL);
        INSERT INTO rank_check_run_items (id, "runId", "keywordId", status, "notBefore")
          VALUES
            ('item-runnable', 'run', 'kw-runnable', 'queued', '2026-09-04 14:00Z'),
            ('item-archived-market', 'run', 'kw-archived-market', 'queued', '2026-09-04 14:00Z'),
            ('item-archived', 'run', 'kw-archived', 'queued', '2026-09-04 14:00Z');
        UPDATE project_markets SET status = 'removed' WHERE id = 'pm-archived';
      `);

      const claimed = await claimDueRankCheckItems(
        { now: new Date("2026-09-04T14:00:00Z") },
        database as never,
      );

      expect(claimed.claimed).toBe(1);
      expect(
        await query('SELECT id, status, "blockedReason" FROM rank_check_run_items ORDER BY id'),
      ).toEqual([
        { id: "item-archived", status: "cancelled", blockedReason: "keyword_archived" },
        { id: "item-archived-market", status: "cancelled", blockedReason: "market_inactive" },
        { id: "item-runnable", status: "running", blockedReason: null },
      ]);
      expect(await query('SELECT "cancelledCount" FROM rank_check_runs')).toEqual([
        { cancelledCount: 2 },
      ]);
      expect(audits.map((audit) => (audit.after as { reason: string }).reason).sort()).toEqual([
        "keyword_archived",
        "market_inactive",
      ]);
      expect(claimed.groups.flatMap((group) => group.keywordIds)).toEqual(["kw-runnable"]);
    } finally {
      await db.close();
    }
  });

  it.each(["manual", "api"])("does not claim immediate %s run items", async (trigger) => {
    const { audits, database, db, query } = await createClaimFixture();
    try {
      await db.exec(`
        INSERT INTO projects VALUES ('project', 'example.com');
        INSERT INTO project_markets VALUES ('pm', 'project', 'market', 'removed');
        INSERT INTO keywords (id, "publicId", "projectId", "locationId", device, "archivedAt")
          VALUES ('kw', '${publicId("kw", "immediate")}', 'project', 'market', 'desktop', NULL);
        INSERT INTO rank_check_runs (id, "publicId", "projectId", "requestedCount",
          "selectionKind", trigger, status, "startedAt")
          VALUES ('run', '${RUN_PUBLIC_ID}', 'project', 1, 'single', '${trigger}', 'queued', NULL);
        INSERT INTO rank_check_run_items (id, "runId", "keywordId", status, "notBefore")
          VALUES ('item', 'run', 'kw', 'queued', NULL);
      `);

      await expect(
        claimDueRankCheckItems({ now: new Date("2026-09-04T14:00:00Z") }, database as never),
      ).resolves.toMatchObject({ claimed: 0, groups: [] });
      expect(await query('SELECT status, "blockedReason" FROM rank_check_run_items')).toEqual([
        { status: "queued", blockedReason: null },
      ]);
      expect(audits).toEqual([]);
    } finally {
      await db.close();
    }
  });

  it("reclaims only an expired unlinked lease and keeps its first start", async () => {
    const { audits, database, db, query } = await createClaimFixture();
    const now = new Date("2026-09-04T14:00:00.000Z");
    const firstStart = new Date("2026-09-04T13:00:00.000Z");
    try {
      await db.exec(`
        INSERT INTO projects VALUES ('project', 'example.com');
        INSERT INTO project_markets VALUES ('pm', 'project', 'market', 'active');
        INSERT INTO keywords (id, "publicId", "projectId", "locationId", device)
          VALUES ('expired-keyword', '${publicId("kw", "expired")}', 'project', 'market', 'desktop'),
            ('linked-keyword', '${publicId("kw", "linked")}', 'project', 'market', 'desktop'),
            ('unexpired-keyword', '${publicId("kw", "unexpired")}', 'project', 'market', 'desktop');
        INSERT INTO rank_check_runs (id, "publicId", "projectId", "requestedCount", "selectionKind", status)
          VALUES ('run', '${RUN_PUBLIC_ID}', 'project', 3, 'scheduled_due', 'running');
        INSERT INTO rank_check_run_items
          (id, "runId", "keywordId", status, "claimAttempts", "claimExpiresAt", "rankCheckId", "startedAt")
          VALUES
            ('expired', 'run', 'expired-keyword', 'running', 1, '2026-09-04 13:59:00', NULL, '2026-09-04 13:00:00'),
            ('linked', 'run', 'linked-keyword', 'running', 1, '2026-09-04 13:59:00', 'check-1', '2026-09-04 13:00:00'),
            ('unexpired', 'run', 'unexpired-keyword', 'running', 1, '2026-09-04 14:01:00', NULL, '2026-09-04 13:00:00');
      `);

      await expect(claimDueRankCheckItems({ now }, database as never)).resolves.toMatchObject({
        claimed: 1,
        groups: [expect.objectContaining({ runItemIds: ["expired"] })],
      });
      expect(
        await query(
          'SELECT id, status, "claimAttempts", "claimExpiresAt", "rankCheckId", "startedAt" FROM rank_check_run_items ORDER BY id',
        ),
      ).toEqual([
        {
          id: "expired",
          status: "running",
          claimAttempts: 2,
          claimExpiresAt: new Date("2026-09-04T14:05:00.000Z"),
          rankCheckId: null,
          startedAt: firstStart,
        },
        {
          id: "linked",
          status: "running",
          claimAttempts: 1,
          claimExpiresAt: new Date("2026-09-04T13:59:00.000Z"),
          rankCheckId: "check-1",
          startedAt: firstStart,
        },
        {
          id: "unexpired",
          status: "running",
          claimAttempts: 1,
          claimExpiresAt: new Date("2026-09-04T14:01:00.000Z"),
          rankCheckId: null,
          startedAt: firstStart,
        },
      ]);
      expect(audits.map((audit) => (audit.after as { reason: string }).reason)).toEqual([
        "lease_expired",
      ]);
    } finally {
      await db.close();
    }
  });

  it("blocks an exhausted expired lease, finalizes its run, and audits the loss", async () => {
    const { audits, database, db, query } = await createClaimFixture();
    const now = new Date("2026-09-04T14:00:00.000Z");
    try {
      await db.exec(`
        INSERT INTO projects VALUES ('project', 'example.com');
        INSERT INTO project_markets VALUES ('pm', 'project', 'market', 'active');
        INSERT INTO keywords (id, "publicId", "projectId", "locationId", device)
          VALUES ('keyword', '${publicId("kw", "lost")}', 'project', 'market', 'desktop');
        INSERT INTO rank_check_runs (id, "publicId", "projectId", "requestedCount", "selectionKind", status)
          VALUES ('run', '${RUN_PUBLIC_ID}', 'project', 1, 'scheduled_due', 'running');
        INSERT INTO rank_check_run_items
          (id, "runId", "keywordId", status, "claimAttempts", "claimExpiresAt", "startedAt")
          VALUES ('lost', 'run', 'keyword', 'running', 3, '2026-09-04 13:59:00', '2026-09-04 13:00:00');
      `);

      await expect(claimDueRankCheckItems({ now }, database as never)).resolves.toMatchObject({
        claimed: 0,
        groups: [],
      });
      expect(
        await query(
          'SELECT status, "blockedReason", "claimAttempts", "claimExpiresAt", "finishedAt" FROM rank_check_run_items',
        ),
      ).toEqual([
        {
          status: "blocked",
          blockedReason: "claim_lost",
          claimAttempts: 4,
          claimExpiresAt: null,
          finishedAt: now,
        },
      ]);
      expect(
        await query('SELECT status, outcome, "skippedCount", "targetCount" FROM rank_check_runs'),
      ).toEqual([{ status: "completed", outcome: "failed", skippedCount: 1, targetCount: 1 }]);
      expect(audits.map((audit) => audit.after)).toEqual([
        expect.objectContaining({ reason: "claim_lost" }),
      ]);
    } finally {
      await db.close();
    }
  });
});
