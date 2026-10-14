import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-review-defaults-key-only-000")],
}));

import { previewDefaultsHost, saveDefaultsHost } from "./defaults";
import {
  confirmDefaults,
  defaultsForm,
  reviewedDefaultsFixture,
} from "./defaults.postgres.test-fixture";
import { defaultsReceiptSchema } from "./defaults-receipt";

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)("defaults receipt SQL boundary", () => {
  let fixture: Awaited<ReturnType<typeof reviewedDefaultsFixture>> | undefined;
  afterEach(async () => fixture?.close());

  it("retains typed string epochs, rejects unknown payloads and preserves receipt immutability", async () => {
    const f = await reviewedDefaultsFixture();
    fixture = f;
    const input = defaultsForm(f.project.project.publicId);
    const quote = await previewDefaultsHost(f.project.writerContext, input, f.db);
    const result = await saveDefaultsHost(
      f.project.writerContext,
      input,
      confirmDefaults(quote),
      f.db,
    );
    const source = await f.db.measurementSettingsMutation.findFirstOrThrow();
    async function insert(value: unknown, operation = "measurement_settings.defaults") {
      return f.client.query(
        `INSERT INTO measurement_settings_mutations
          (id,"projectId","actorId","actorScopeHash",operation,"keyHash","bodyHash","previousSourceHash","resultSourceHash",result)
        SELECT $1,"projectId","actorId","actorScopeHash",$2,$3,"bodyHash","previousSourceHash","resultSourceHash",$4::jsonb
          FROM measurement_settings_mutations WHERE id=$5 RETURNING result`,
        [
          randomUUID(),
          operation,
          randomBytes(32).toString("hex"),
          JSON.stringify(value),
          source.id,
        ],
      );
    }
    const epoch = "9007199254740993";
    const saved = await insert({ ...result, revision: epoch });
    expect(defaultsReceiptSchema.parse(saved.rows[0]?.result).revision).toBe(epoch);
    for (const invalid of [
      { ...result, revision: 2 },
      { ...result, revision: "01" },
      { ...result, revision: "9223372036854775808" },
      { ...result, sourceHash: "0".repeat(64) },
      { ...result, value: { ...result.value, raw: { credential: "synthetic" } } },
      { ...result, market: null },
      { ...result, timestamps: { ...result.timestamps, updatedAt: null } },
    ])
      await expect(insert(invalid)).rejects.toMatchObject({ code: "23514" });
    await expect(insert(result, "measurement_settings.unknown")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(insert(result, "measurement_settings.intent")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      f.client.query('UPDATE measurement_settings_mutations SET "actorId"=NULL WHERE id=$1', [
        source.id,
      ]),
    ).rejects.toThrow("receipt_immutable");
    await expect(
      f.client.query("DELETE FROM measurement_settings_mutations WHERE id=$1", [source.id]),
    ).rejects.toThrow("receipt_retained");
  }, 120_000);
});
