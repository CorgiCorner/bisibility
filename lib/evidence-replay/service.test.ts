import { makePublicId } from "@/lib/db/public-id-resources";
import { expect, it, vi } from "vitest";
import { replayDigest } from "./hash";
import { ORGANIC_EVIDENCE_REPLAY_VERSION, type ReplayDatabase } from "./model";
import { applyEvidenceReplayBatch, prepareEvidenceReplay } from "./service";
import { codeHash, projectPublicId, source, window } from "./test-fixture";

const actor = { id: "writer", memberships: [] },
  authority = { kind: "session" as const, actor };
function database(rows = [source()]) {
  const calls: string[] = [];
  const { rawText: _raw, storedText: _stored, observation: _obs, ...first } = rows[0];
  const principal = { kind: "session", reference: actor.id, projectId: "project", projectPublicId };
  const manifest = rows.map(
    ({ rawText: _r, storedText: _s, observation: _o, ...candidate }) => candidate,
  );
  const run = {
    id: "run",
    projectId: "project",
    initiatorKind: "session",
    initiatorRef: actor.id,
    parserVersion: ORGANIC_EVIDENCE_REPLAY_VERSION,
    codeHash,
    manifest,
    manifestHash: replayDigest(manifest),
    request: window,
    requestHash: replayDigest([
      principal,
      { ...window, batchSize: undefined },
      ORGANIC_EVIDENCE_REPLAY_VERSION,
      codeHash,
    ]),
    cursor: 0,
    revision: 0,
    applied: 0,
    excluded: 0,
    projectionPresent: 0,
    state: "running",
    snapshotAt: "2026-10-12T12:00:00Z",
  };
  const query = vi.fn<ReplayDatabase["query"]>(async (sql) => {
    calls.push(sql);
    if (sql.startsWith('SELECT id,"publicId"'))
      return {
        rows: [{ id: "project", publicId: projectPublicId, writeMode: "active", isSample: false }],
      };
    if (sql.startsWith("SELECT id FROM users")) return { rows: [{ id: actor.id }] };
    if (sql.startsWith("SELECT role FROM memberships")) return { rows: [{ role: "member" }] };
    if (sql.startsWith("SELECT count(*)::int AS count,COALESCE"))
      return { rows: [{ count: rows.length, bytes: 100 }] };
    if (sql.startsWith("SELECT count(*)::int AS count FROM observation_items"))
      return { rows: [{ count: 0 }] };
    if (sql.startsWith("SELECT * FROM history_evidence")) return { rows: [run] };
    if (sql.startsWith('SELECT c.id AS "checkId"'))
      return { rows: rows.map(({ observationHash: _h, ...row }) => row) };
    if (sql.startsWith("UPDATE rank_checks")) return { rows: [{ id: first.checkId }] };
    if (sql.startsWith("UPDATE history_evidence")) return { rows: [{ id: "run" }] };
    return { rows: [] };
  });
  return { query, calls, run, rows };
}
it("read-only dry-run scopes whole history with stable watermark and creates no receipt/audit", async () => {
  const db = database();
  const report = await prepareEvidenceReplay(
    db,
    authority,
    window,
    codeHash,
    true,
    () => new Date("2026-10-12T12:00:00Z"),
  );
  expect(report).toMatchObject({ dryRun: true, run: null, expected: { scanned: 1, changed: 1 } });
  expect(db.calls[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  expect(
    db.calls.some((sql) => /^(?:INSERT|UPDATE|DELETE)\b/u.test(sql) || /\baudit_logs\b/u.test(sql)),
  ).toBe(false);
  expect(db.calls.find((sql) => sql.includes('ORDER BY c."checkedAt",c.id'))).not.toContain(
    "DISTINCT ON",
  );
});
it("rolls back and refuses capacity instead of silently selecting latest/a page", async () => {
  const db = database(Array.from({ length: 3 }, () => source()));
  await expect(
    prepareEvidenceReplay(
      db,
      authority,
      { ...window, maxRows: 2 },
      codeHash,
      true,
      () => new Date("2026-10-12T12:00:00Z"),
    ),
  ).rejects.toThrow("capacity");
  expect(db.calls.at(-1)).toBe("ROLLBACK");
});
it("atomically writes only NULL projection + append receipt + checkpoint, without raw/time/financial changes", async () => {
  const db = database();
  expect(
    await applyEvidenceReplayBatch(db, authority, projectPublicId, "run", codeHash),
  ).toMatchObject({ state: "completed", cursor: 1, counts: { applied: 1 } });
  const write = db.calls.find((sql) => sql.startsWith("UPDATE rank_checks"))!;
  expect(write).toContain('"organicRanks" IS NULL');
  expect(write.split("FROM")[0]).toBe('UPDATE rank_checks c SET "organicRanks"=s.facts ');
  expect(
    db.calls.findIndex((sql) => sql.startsWith("INSERT INTO history_evidence_replay_receipts")),
  ).toBeLessThan(
    db.calls.findIndex((sql) => sql.startsWith("UPDATE history_evidence_replay_runs")),
  );
  expect(db.calls.at(-1)).toBe("COMMIT");
});
it("refuses changed source before any write and restores the transaction", async () => {
  const db = database();
  db.rows[0].rawHash = "a".repeat(64);
  await expect(
    applyEvidenceReplayBatch(db, authority, projectPublicId, "run", codeHash),
  ).rejects.toThrow("conflict");
  expect(db.calls.some((sql) => sql.startsWith("UPDATE"))).toBe(false);
  expect(db.calls.at(-1)).toBe("ROLLBACK");
});
it("checks fresh user membership even on completed idempotent replay", async () => {
  const db = database();
  db.run.state = "completed";
  db.run.cursor = 1;
  db.run.applied = 1;
  expect(
    await applyEvidenceReplayBatch(db, authority, projectPublicId, "run", codeHash),
  ).toMatchObject({ state: "completed" });
  expect(db.calls.some((sql) => sql.startsWith("SELECT role FROM memberships"))).toBe(true);
  expect(db.calls.some((sql) => sql.startsWith("UPDATE"))).toBe(false);
});
it("refuses stale parser/code and foreign project principal without writes", async () => {
  const db = database();
  db.run.codeHash = "a".repeat(64);
  await expect(
    applyEvidenceReplayBatch(db, authority, projectPublicId, "run", codeHash),
  ).rejects.toThrow("conflict");
  expect(db.calls.at(-1)).toBe("ROLLBACK");
  expect(() => makePublicId("prj")).not.toThrow();
});
it("rolls back projection if receipt or checkpoint fails", async () => {
  const db = database();
  const original = db.query.getMockImplementation()!;
  db.query.mockImplementation(async (sql, values) => {
    if (sql.startsWith("INSERT INTO history_evidence_replay_receipts"))
      throw new Error("synthetic receipt failure");
    return original(sql, values);
  });
  await expect(
    applyEvidenceReplayBatch(db, authority, projectPublicId, "run", codeHash),
  ).rejects.toThrow("synthetic receipt failure");
  expect(db.calls.at(-1)).toBe("ROLLBACK");
});
