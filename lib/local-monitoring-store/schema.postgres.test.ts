import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { describe, expect, it } from "vitest";
import { collectLocalMeasurementItem } from "./collect-item";
import { claimLocalContinuation } from "./continuation-lease";
import { localMeasurementDatabase } from "./postgres.test-fixture";
import { prepareLocalMeasurementRun } from "./prepare-run";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);

suite("neutral local measurement database constraints (full migrations)", () => {
  it("enforces all-null or all-present prepared refs and immutable custody after INSERT", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      await prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db);
      const item = await f.db.localMeasurementRunItem.findFirstOrThrow();
      await expect(
        f.client.query(
          'UPDATE local_measurement_run_items SET "preparedLeaseId"=NULL WHERE id=$1',
          [item.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client.query(
          'UPDATE local_measurement_run_items SET "preparedAttemptId"=$1 WHERE id=$2',
          [randomUUID(), item.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client.query('UPDATE local_measurement_run_items SET "connectionId"=$1 WHERE id=$2', [
          randomUUID(),
          item.id,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (await f.db.localMeasurementRunItem.findUniqueOrThrow({ where: { id: item.id } }))
          .preparedAttemptId,
      ).toBe(item.preparedAttemptId);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rejects record/row CAS version divergence", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      await prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db);
      const item = await f.db.localMeasurementRunItem.findFirstOrThrow();
      await expect(
        f.client.query("UPDATE local_measurement_run_items SET version=version+1 WHERE id=$1", [
          item.id,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rejects missing and JSON-null record versions instead of accepting SQL CHECK unknown", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      await prepareLocalMeasurementRun(f.launch([target]), f.writerContext, f.ports, f.db);
      const item = await f.db.localMeasurementRunItem.findFirstOrThrow();
      await expect(
        f.client.query(
          `UPDATE local_measurement_run_items SET record=record-'version' WHERE id=$1`,
          [item.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client.query(
          `UPDATE local_measurement_run_items SET record=jsonb_set(record,'{version}','null') WHERE id=$1`,
          [item.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await f.close();
    }
  }, 120_000);
  it("rejects cross-project targets and wrong-target item ownership", async () => {
    const f = await localMeasurementDatabase();
    try {
      const first = await f.target();
      const second = await f.target("22");
      await prepareLocalMeasurementRun(f.launch([first]), f.writerContext, f.ports, f.db);
      const item = await f.db.localMeasurementRunItem.findFirstOrThrow();
      const target = await f.db.localMeasurementTarget.findUniqueOrThrow({
        where: { publicId: second.id },
      });
      await expect(
        f.client.query(
          'INSERT INTO local_measurement_target_owners("projectId","targetId","itemId","updatedAt") VALUES($1,$2,$3,NOW())',
          [f.project.id, target.id, item.id],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      const foreign = await f.db.project.create({
        data: {
          publicId: makePublicId("prj"),
          name: "Foreign synthetic",
          domain: "foreign.test",
          ownerId: f.owner.id,
        },
      });
      await expect(
        f.client.query(
          'INSERT INTO local_measurement_targets(id,"publicId","projectId","keywordId","pointId","targetKey",target,"keywordSnapshot","keywordSourceHash") SELECT $1,$2,$3,"keywordId","pointId",$4,target,"keywordSnapshot","keywordSourceHash" FROM local_measurement_targets WHERE id=$5',
          [randomUUID(), makePublicId("lmt"), foreign.id, randomUUID(), target.id],
        ),
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await f.close();
    }
  }, 120_000);
  it("requires exactly one legacy or neutral owner and matching project", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      const item = await f.db.localMeasurementRunItem.findFirstOrThrow();
      const check = await f.db.rankCheck.create({
        data: {
          publicId: makePublicId("check"),
          keywordId: f.keyword.id,
          provider: "synthetic",
          status: "completed",
        },
      });
      const insert = `INSERT INTO observation_runs(id,"projectId","rankCheckId","neutralExecutionItemId",provider,surface,engine,"requestPolicy",completeness,"configuredScope","executedAt") VALUES($1,$2,$3,$4,'synthetic','web_serp','google','{}','unknown','{}',NOW())`;
      await expect(
        f.client.query(insert, [randomUUID(), f.project.id, null, null]),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client.query(insert, [randomUUID(), f.project.id, check.id, item.id]),
      ).rejects.toMatchObject({ code: "P0001", message: "neutral_observation_binding_mismatch" });
      const foreign = await f.db.project.create({
        data: {
          publicId: makePublicId("prj"),
          name: "Foreign synthetic",
          domain: "foreign.test",
          ownerId: f.owner.id,
        },
      });
      await expect(
        f.client.query(insert, [randomUUID(), foreign.id, null, item.id]),
      ).rejects.toMatchObject({ code: "P0001", message: "neutral_observation_binding_mismatch" });
      await expect(
        f.client.query(insert, [randomUUID(), foreign.id, check.id, null]),
      ).rejects.toMatchObject({ code: "23503" });
      await prepared.submitters[0].submit();
      const reference = { projectId: f.project.publicId, runId: prepared.id, targetId: target.id };
      const owner = await f.db.localMeasurementTargetOwner.findFirstOrThrow({
        where: { projectId: f.project.id, targetId: item.targetId, itemId: item.id },
      });
      const lease = await claimLocalContinuation(
        { ...reference, expectedVersion: owner.version, purpose: "collect" },
        f.writerContext,
        { ttlMs: 60_000, clock: f.clock },
        f.db,
      );
      await collectLocalMeasurementItem(
        reference,
        f.writerContext,
        lease,
        f.ports.adapter,
        f.normalizer,
        f.clock,
        f.db,
      );
      expect(
        await f.db.observationRun.findFirst({ where: { neutralExecutionItemId: item.id } }),
      ).toMatchObject({ projectId: f.project.id, rankCheckId: null });
      await f.client.query(insert, [randomUUID(), f.project.id, check.id, null]);
      expect(await f.db.observationRun.count()).toBe(2);
    } finally {
      await f.close();
    }
  }, 120_000);
  it("preserves immutable target/point revisions and rejects direct attribution removal", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const stored = await f.db.localMeasurementTarget.findUniqueOrThrow({
        where: { publicId: target.id },
      });
      await expect(
        f.client.query('UPDATE local_measurement_targets SET "actorId"=NULL WHERE id=$1', [
          stored.id,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client.query(
          `UPDATE local_measurement_targets SET target=jsonb_set(target,'{device}','"mobile"') WHERE id=$1`,
          [stored.id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        f.client.query(
          `UPDATE local_measurement_points SET point=jsonb_set(point,'{coordinate,latitude}','"53.0000000"') WHERE id=$1`,
          [stored.pointId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await f.close();
    }
  }, 120_000);
  it("allows genuine User deletion to remove nullable attribution while retaining custody/history", async () => {
    const f = await localMeasurementDatabase();
    try {
      const target = await f.target();
      const prepared = await prepareLocalMeasurementRun(
        f.launch([target]),
        f.writerContext,
        f.ports,
        f.db,
      );
      const original = await f.db.localMeasurementRunItem.findFirstOrThrow();
      await f.db.user.delete({ where: { id: f.writer.id } });
      const stored = await f.db.localMeasurementTarget.findUniqueOrThrow({
        where: { publicId: target.id },
      });
      expect(stored.actorId).toBeNull();
      expect(
        (await f.db.localMeasurementPoint.findUniqueOrThrow({ where: { id: stored.pointId } }))
          .actorId,
      ).toBeNull();
      expect(
        (await f.db.localMeasurementRun.findUniqueOrThrow({ where: { publicId: prepared.id } }))
          .actorId,
      ).toBeNull();
      expect(
        (await f.db.localMeasurementRunItem.findUniqueOrThrow({ where: { id: original.id } }))
          .preparedAttemptId,
      ).toBe(original.preparedAttemptId);
      expect(await f.db.localMeasurementTargetOwner.count()).toBe(1);
    } finally {
      await f.close();
    }
  }, 120_000);
});
