import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fixtureSnapshot } from "@/components/measurement-settings/test-fixtures";
import { definitionProjectScope } from "@/lib/measurement-definitions/access";
import { definitionDatabaseFixture } from "@/lib/measurement-definitions/postgres.test-fixture";
import { readSettingsMutation, settingsMutationScope, writeSettingsMutation } from "./receipts";

/** Full reviewed migration chain and OWNED isolated DB only; no partial schema or execution in this lane. */
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "settings receipt real authority AUTHORED_NOT_RUN",
  () => {
    let f: Awaited<ReturnType<typeof definitionDatabaseFixture>>;
    beforeEach(async () => {
      f = await definitionDatabaseFixture();
      const table = await f.client.query(
        "SELECT to_regclass('public.measurement_settings_mutations') IS NOT NULL AS installed",
      );
      if (!table.rows[0]?.installed)
        throw new Error("Materialize full reviewed settings migration first");
    }, 120000);
    afterEach(async () => {
      await f?.close();
    });
    function scope(key: string = randomUUID()) {
      return settingsMutationScope(
        f.project.project.id,
        f.project.writer.id,
        "measurement_settings.intent",
        { idempotencyKey: key },
      );
    }
    async function authorizedReplay(value: ReturnType<typeof scope>) {
      return f.db.$transaction(async (tx) => {
        await definitionProjectScope(
          tx,
          f.project.writerContext,
          f.project.project.publicId,
          "update",
          "project_defaults",
        );
        return readSettingsMutation(tx, value);
      });
    }
    it("replays an exact committed snapshot; rejects body contradiction and fresh role revocation before replay", async () => {
      const value = scope();
      await f.db.$transaction(async (tx) => {
        await definitionProjectScope(
          tx,
          f.project.writerContext,
          f.project.project.publicId,
          "update",
          "project_defaults",
        );
        await writeSettingsMutation(
          tx,
          value,
          f.project.writer.id,
          "a".repeat(64),
          fixtureSnapshot,
        );
      });
      expect(await authorizedReplay(value)).toEqual(fixtureSnapshot);
      expect(await authorizedReplay(value)).toEqual(fixtureSnapshot);
      await expect(authorizedReplay({ ...value, bodyHash: "f".repeat(64) })).rejects.toMatchObject({
        code: "mutation_conflict",
      });
      await f.db.membership.updateMany({
        where: { projectId: f.project.project.id, userId: f.project.writer.id },
        data: { role: "viewer" },
      });
      await expect(authorizedReplay(value)).rejects.toMatchObject({ code: "forbidden" });
      expect(
        await f.db.measurementSettingsMutation.count({
          where: { projectId: f.project.project.id },
        }),
      ).toBe(1);
    });
    it("rolls back receipt with the mutation; actor/operation keys do not cross scopes", async () => {
      const value = scope();
      await expect(
        f.db.$transaction(async (tx) => {
          await writeSettingsMutation(
            tx,
            value,
            f.project.writer.id,
            "a".repeat(64),
            fixtureSnapshot,
          );
          throw new Error("Synthetic mutation rollback");
        }),
      ).rejects.toThrow();
      expect(
        await f.db.measurementSettingsMutation.count({
          where: { projectId: f.project.project.id },
        }),
      ).toBe(0);
      expect(scope("same-key").keyHash).not.toBe(
        settingsMutationScope(
          f.project.project.id,
          f.project.owner.id,
          "measurement_settings.intent",
          { idempotencyKey: "same-key" },
        ).keyHash,
      );
      expect(scope("same-key").keyHash).not.toBe(
        settingsMutationScope(
          f.project.project.id,
          f.project.writer.id,
          "measurement_settings.schedule",
          { idempotencyKey: "same-key" },
        ).keyHash,
      );
    });
    it("retains attribution except genuine User deletion, resists TEMP authority shadowing and clears on Project cascade", async () => {
      const value = scope();
      await f.db.$transaction((tx) =>
        writeSettingsMutation(tx, value, f.project.writer.id, "a".repeat(64), fixtureSnapshot),
      );
      await expect(
        f.client.query(
          'UPDATE public.measurement_settings_mutations SET "actorId"=NULL WHERE "keyHash"=$1',
          [value.keyHash],
        ),
      ).rejects.toThrow("receipt_immutable");
      await f.client.query("CREATE TEMP TABLE projects (id text)");
      await expect(
        f.client.query('DELETE FROM public.measurement_settings_mutations WHERE "keyHash"=$1', [
          value.keyHash,
        ]),
      ).rejects.toThrow("receipt_retained");
      await f.db.user.delete({ where: { id: f.project.writer.id } });
      expect(
        (await f.db.measurementSettingsMutation.findFirst({ where: { keyHash: value.keyHash } }))
          ?.actorId,
      ).toBeNull();
      await f.db.project.delete({ where: { id: f.project.project.id } });
      expect(
        await f.db.measurementSettingsMutation.count({
          where: { projectId: f.project.project.id },
        }),
      ).toBe(0);
    });
    it("rejects missing/null/string revision and nested raw fields at the real SQL boundary", async () => {
      for (const result of [
        { ...fixtureSnapshot, revision: null },
        { ...fixtureSnapshot, revision: "4" },
        {
          ...fixtureSnapshot,
          selection: { ...fixtureSnapshot.selection, raw: { synthetic: true } },
        },
        { ...fixtureSnapshot, defaultIntent: null },
      ]) {
        const value = scope();
        await expect(
          f.client.query(
            `INSERT INTO public.measurement_settings_mutations
        (id,"projectId","actorId","actorScopeHash",operation,"keyHash","bodyHash","previousSourceHash","resultSourceHash",result)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
            [
              randomUUID(),
              value.projectId,
              f.project.writer.id,
              value.actorScopeHash,
              value.operation,
              value.keyHash,
              value.bodyHash,
              "a".repeat(64),
              fixtureSnapshot.sourceHash,
              JSON.stringify(result),
            ],
          ),
        ).rejects.toThrow();
      }
    });
  },
);
