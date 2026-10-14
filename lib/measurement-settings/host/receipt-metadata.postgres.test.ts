import type { Prisma } from "@/lib/generated/prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previewDefaultsHost, saveDefaultsHost } from "./defaults";
import {
  confirmDefaults,
  defaultsForm,
  reviewedDefaultsFixture,
} from "./defaults.postgres.test-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-consent-key-012345678900")],
}));
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)("typed receipt metadata", () => {
  let fixture: Awaited<ReturnType<typeof reviewedDefaultsFixture>>;
  afterEach(async () => fixture?.close());
  it("keeps old receipts valid and rejects unknown or malformed metadata in native constraints", async () => {
    fixture = await reviewedDefaultsFixture();
    const base = {
      revision: 1,
      sourceHash: "a".repeat(64),
      scheduleId: null,
      schedule: null,
      defaultIntent: { geoId: "synthetic-geo", languageCode: "en", device: "desktop", depth: 20 },
      selection: {
        geoId: "synthetic-geo",
        languageCode: "en",
        device: "desktop",
        depth: 20,
        providerId: "dataforseo",
        capabilityVersion: "synthetic-v1",
        surface: "web_serp",
      },
    };
    let ordinal = 0;
    const insert = (result: Prisma.InputJsonObject) =>
      fixture.db.measurementSettingsMutation.create({
        data: {
          id: `synthetic-metadata-${++ordinal}`,
          projectId: fixture.project.project.id,
          actorId: null,
          operation: "measurement_settings.intent",
          actorScopeHash: "b".repeat(64),
          keyHash: ordinal.toString(16).padStart(64, "0"),
          bodyHash: "c".repeat(64),
          previousSourceHash: "d".repeat(64),
          resultSourceHash: base.sourceHash,
          result,
        },
      });
    await insert(base);
    const scopeSources = {
      geo: "project",
      language: "project",
      device: "explicit",
      surface: "unknown",
      depth: "keyword",
      provider: "schedule",
    };
    await insert({
      ...base,
      scopeSources,
      nextRun: { at: "2026-10-13T12:00:00.000Z", timezone: "UTC", basis: "captured_calendar" },
    });
    const count = await fixture.db.measurementSettingsMutation.count();
    for (const result of [
      { ...base, unknownMetadata: true },
      { ...base, scopeSources: { ...scopeSources, geo: "unsupported" } },
      { ...base, scopeSources: [] },
      { ...base, scopeSources: { ...scopeSources, leakedSecret: "synthetic-secret" } },
      { ...base, nextRun: { at: "not-a-date", timezone: "UTC", basis: "captured_calendar" } },
      { ...base, nextRun: { at: null, timezone: "UTC", basis: "invented" } },
    ]) {
      await expect(insert(result)).rejects.toMatchObject({
        meta: {
          driverAdapterError: {
            cause: {
              code: "23514",
              message:
                'new row for relation "measurement_settings_mutations" violates check constraint "measurement_settings_result"',
            },
          },
        },
      });
      expect(await fixture.db.measurementSettingsMutation.count()).toBe(count);
    }
    const request = defaultsForm(fixture.project.project.publicId);
    const preview = await previewDefaultsHost(fixture.keyContext, request, fixture.db);
    await saveDefaultsHost(fixture.keyContext, request, confirmDefaults(preview), fixture.db);
    const defaults = await fixture.db.measurementSettingsMutation.findFirstOrThrow({
      where: { operation: "measurement_settings.defaults" },
    });
    const result = { ...(defaults.result as Record<string, unknown>), scopeSources };
    const before = await fixture.db.measurementSettingsMutation.count();
    await expect(
      fixture.db.measurementSettingsMutation.create({
        data: { ...defaults, id: "synthetic-invalid-defaults", keyHash: "e".repeat(64), result },
      }),
    ).rejects.toMatchObject({
      meta: {
        driverAdapterError: {
          cause: {
            code: "23514",
            message:
              'new row for relation "measurement_settings_mutations" violates check constraint "measurement_settings_result"',
          },
        },
      },
    });
    expect(await fixture.db.measurementSettingsMutation.count()).toBe(before);
  }, 120000);
});
