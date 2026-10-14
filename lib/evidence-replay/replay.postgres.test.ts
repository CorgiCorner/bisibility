import {
  type BusinessPgFixture,
  businessLocationDatabase,
} from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReplayAuthority, ReplayDatabase } from "./model";
import {
  originalCheckSnapshot,
  rejectReceiptDatabase,
  seedReplayProject,
} from "./postgres.test-fixture";
import { applyEvidenceReplayBatch, prepareEvidenceReplay } from "./service";
import { stopEvidenceReplay } from "./stop";
import { codeHash } from "./test-fixture";

const enabled = Boolean(process.env.PROVIDER_UI_TEST_DATABASE_URL);
describe.runIf(enabled)("owned full-schema original-history evidence replay", () => {
  let fixture: BusinessPgFixture;
  beforeAll(async () => {
    fixture = await businessLocationDatabase();
  }, 120000);
  afterAll(async () => {
    await fixture?.close();
  }, 30000);
  const database = (): ReplayDatabase => ({
    query: async (sql, values) => fixture.client.query(sql, values ? [...values] : []),
  });

  it("dry-run makes no provenance writes; two original checks are replayed exactly once across resume/two runs", async () => {
    const value = await seedReplayProject(fixture);
    const db = database();
    const before = await originalCheckSnapshot(fixture, value.keyword.id);
    const dry = await prepareEvidenceReplay(db, value.authority, value.request, codeHash);
    expect(dry.expected).toMatchObject({ scanned: 2, changed: 2 });
    expect(dry.run).toBeNull();
    expect(
      await fixture.db.historyEvidenceReplayRun.count({ where: { projectId: value.project.id } }),
    ).toBe(0);
    const first = (await prepareEvidenceReplay(db, value.authority, value.request, codeHash, false))
      .run!;
    expect(
      (
        await applyEvidenceReplayBatch(
          db,
          value.authority,
          value.project.publicId,
          first.id,
          codeHash,
          1,
        )
      ).counts.applied,
    ).toBe(1);
    expect(
      (
        await applyEvidenceReplayBatch(
          db,
          value.authority,
          value.project.publicId,
          first.id,
          codeHash,
          1,
        )
      ).state,
    ).toBe("completed");
    expect(
      (
        await applyEvidenceReplayBatch(
          db,
          value.authority,
          value.project.publicId,
          first.id,
          codeHash,
          1,
        )
      ).revision,
    ).toBe(2);
    const after = await originalCheckSnapshot(fixture, value.keyword.id);
    expect(after).toEqual(before);
    const receipts = await fixture.db.historyEvidenceReplayReceipt.findMany({
      where: { runId: first.id },
    });
    expect(receipts).toHaveLength(2);
    expect(
      receipts.every(
        (r) => r.retainedObservedAt === null && r.qualification === "retained_facts_only",
      ),
    ).toBe(true);
    const second = (
      await prepareEvidenceReplay(db, value.authority, value.request, codeHash, false)
    ).run!;
    expect(
      (
        await applyEvidenceReplayBatch(
          db,
          value.authority,
          value.project.publicId,
          second.id,
          codeHash,
          2,
        )
      ).counts,
    ).toEqual({ scanned: 2, applied: 0, excluded: 0, projectionPresent: 2 });
    expect(await fixture.db.observationRun.count({ where: { projectId: value.project.id } })).toBe(
      0,
    );
  }, 30000);
  it("changed source/code stops before atomic projection and checkpoint; new explicit run can retain real new facts", async () => {
    const value = await seedReplayProject(fixture, 1),
      db = database();
    const run = (await prepareEvidenceReplay(db, value.authority, value.request, codeHash, false))
      .run!;
    await expect(
      applyEvidenceReplayBatch(db, value.authority, value.project.publicId, run.id, "a".repeat(64)),
    ).rejects.toThrow("conflict");
    await expect(
      applyEvidenceReplayBatch(
        rejectReceiptDatabase(fixture),
        value.authority,
        value.project.publicId,
        run.id,
        codeHash,
      ),
    ).rejects.toThrow("division by zero");
    expect(
      (
        await fixture.client.query(
          'SELECT "organicRanks" IS NULL AS missing FROM rank_checks WHERE id=$1',
          [value.checks[0].id],
        )
      ).rows[0].missing,
    ).toBe(true);
    expect(
      (await fixture.db.historyEvidenceReplayRun.findUniqueOrThrow({ where: { id: run.id } }))
        .cursor,
    ).toBe(0);

    await fixture.db.rankCheck.update({
      where: { id: value.checks[0].id },
      data: { raw: { organic_results: [{ domain: "changed.test", rank: 3 }] } },
    });
    await expect(
      applyEvidenceReplayBatch(db, value.authority, value.project.publicId, run.id, codeHash),
    ).rejects.toThrow("conflict");
    expect(
      (await fixture.db.historyEvidenceReplayRun.findUniqueOrThrow({ where: { id: run.id } }))
        .cursor,
    ).toBe(0);
    expect(await fixture.db.historyEvidenceReplayReceipt.count({ where: { runId: run.id } })).toBe(
      0,
    );
    expect(
      (
        await fixture.client.query(
          'SELECT "organicRanks" IS NULL AS missing FROM rank_checks WHERE id=$1',
          [value.checks[0].id],
        )
      ).rows[0].missing,
    ).toBe(true);
    const fresh = (await prepareEvidenceReplay(db, value.authority, value.request, codeHash, false))
      .run!;
    expect(
      (
        await applyEvidenceReplayBatch(
          db,
          value.authority,
          value.project.publicId,
          fresh.id,
          codeHash,
        )
      ).counts.applied,
    ).toBe(1);
  });
  it("fresh revocation/cross-project replay refuses even completed run or retained checkpoints", async () => {
    const value = await seedReplayProject(fixture, 1),
      other = await seedReplayProject(fixture, 1),
      db = database();
    const run = (await prepareEvidenceReplay(db, value.authority, value.request, codeHash, false))
      .run!;
    await expect(
      applyEvidenceReplayBatch(db, other.authority, other.project.publicId, run.id, codeHash),
    ).rejects.toThrow("conflict");
    await fixture.db.membership.deleteMany({
      where: { projectId: value.project.id, userId: value.writer.id },
    });
    await expect(
      applyEvidenceReplayBatch(db, value.authority, value.project.publicId, run.id, codeHash),
    ).rejects.toThrow();
    expect(
      (await fixture.db.historyEvidenceReplayRun.findUniqueOrThrow({ where: { id: run.id } }))
        .cursor,
    ).toBe(0);
  });
  it("frozen watermark omits newly-created history without silently changing manifest", async () => {
    const value = await seedReplayProject(fixture, 1),
      db = database();
    const run = (await prepareEvidenceReplay(db, value.authority, value.request, codeHash, false))
      .run!;
    await fixture.db.rankCheck.create({
      data: {
        keywordId: value.keyword.id,
        publicId: makePublicId("check"),
        provider: "dataforseo",
        status: "completed",
        checkedAt: new Date("2026-10-10T13:00:00Z"),
        raw: { organic_results: [] },
      },
    });
    expect(
      (
        await applyEvidenceReplayBatch(
          db,
          value.authority,
          value.project.publicId,
          run.id,
          codeHash,
        )
      ).counts.scanned,
    ).toBe(1);
    expect(
      (await prepareEvidenceReplay(db, value.authority, value.request, codeHash)).expected.scanned,
    ).toBe(2);
  });
  it("SQL rejects forged checkpoint/evidence/manifest updates while ordinary source retention deletion remains allowed", async () => {
    const value = await seedReplayProject(fixture, 1),
      db = database();
    const run = (await prepareEvidenceReplay(db, value.authority, value.request, codeHash, false))
      .run!;
    await expect(
      fixture.client.query(
        "UPDATE history_evidence_replay_runs SET cursor=1,applied=1,revision=1 WHERE id=$1",
        [run.id],
      ),
    ).rejects.toThrow("checkpoint_receipts");
    await expect(
      fixture.client.query(
        'UPDATE history_evidence_replay_runs SET "codeHash"=$2,revision=1 WHERE id=$1',
        [run.id, "a".repeat(64)],
      ),
    ).rejects.toThrow("immutable_input");
    await applyEvidenceReplayBatch(db, value.authority, value.project.publicId, run.id, codeHash);
    await expect(
      fixture.client.query(
        'UPDATE history_evidence_replay_receipts SET "sourceHash"=$2 WHERE "runId"=$1',
        [run.id, "a".repeat(64)],
      ),
    ).rejects.toThrow("immutable");
    await fixture.db.keyword.delete({ where: { id: value.keyword.id } });
    expect(await fixture.db.historyEvidenceReplayReceipt.count({ where: { runId: run.id } })).toBe(
      0,
    );
    expect(
      (await fixture.db.historyEvidenceReplayRun.findUniqueOrThrow({ where: { id: run.id } }))
        .applied,
    ).toBe(1);
    await fixture.db.project.delete({ where: { id: value.project.id } });
    expect(await fixture.db.historyEvidenceReplayRun.count({ where: { id: run.id } })).toBe(0);
  });
  it("deleted original source becomes named source_missing; stop/resume never invents replacement evidence", async () => {
    const value = await seedReplayProject(fixture, 2),
      db = database();
    const run = (await prepareEvidenceReplay(db, value.authority, value.request, codeHash, false))
      .run!;
    await fixture.db.rankCheck.delete({ where: { id: value.checks[0].id } });
    const first = await applyEvidenceReplayBatch(
      db,
      value.authority,
      value.project.publicId,
      run.id,
      codeHash,
      1,
    );
    expect(first.counts.excluded).toBe(1);
    expect(
      (await fixture.db.historyEvidenceReplayReceipt.findFirstOrThrow({ where: { runId: run.id } }))
        .status,
    ).toBe("source_missing");
    await stopEvidenceReplay(db, value.authority, value.project.publicId, run.id, codeHash);
    expect(
      (
        await applyEvidenceReplayBatch(
          db,
          value.authority,
          value.project.publicId,
          run.id,
          codeHash,
        )
      ).state,
    ).toBe("stopped");
    expect(
      (
        await fixture.client.query(
          'SELECT "organicRanks" IS NULL AS missing FROM rank_checks WHERE id=$1',
          [value.checks[1].id],
        )
      ).rows[0].missing,
    ).toBe(true);
  });
});
