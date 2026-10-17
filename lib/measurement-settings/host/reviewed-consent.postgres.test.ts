import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-test-key-only-0123456789")],
}));

import { makePublicId } from "@/lib/db/public-id-resources";
import { configureHostDefinitionPolicy } from "@/lib/measurement-definitions/host-policy-configuration";
import { readHostDefinitionPolicy } from "@/lib/measurement-definitions/host-policy-snapshot";
import { definitionDatabaseFixture } from "@/lib/measurement-definitions/postgres.test-fixture";
import { canonicalKey } from "@/lib/serp/location";
import { settingsScheduleForecast } from "./forecast";
import { settingsIntentEffect } from "./intent-effect";
import { signSettingsQuote } from "./quote-binding";
import { readMeasurementSettingsHost } from "./read";
import { saveMeasurementIntentHost } from "./save-intent";
import { saveMeasurementScheduleHost } from "./save-schedule";
import { loadSettingsSource } from "./source";

/** Actual reviewed writer audit projection in the maintained owned database harness. */
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "reviewed intent and schedule consent in actual transactions",
  () => {
    let f: Awaited<ReturnType<typeof definitionDatabaseFixture>>;
    beforeEach(async () => {
      vi.stubEnv("BISIBILITY_FAKE_PROVIDER", "1");
      vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
      vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "0");
      f = await definitionDatabaseFixture();
      const projectId = f.project.project.id,
        originalLocation = f.observation.location;
      const location = await f.db.location.update({
        where: { id: originalLocation.id },
        data: {
          canonicalKey: canonicalKey({
            countryCode: originalLocation.countryCode,
            kind: "city",
            cityName: originalLocation.displayName,
            languageCode: originalLocation.languageCode,
          }),
          cityName: originalLocation.displayName,
        },
      });
      await f.db.projectMarket.create({
        data: { projectId, locationId: location.id, publicId: makePublicId("pmkt") },
      });
      await f.db.projectDefaults.create({
        data: {
          projectId,
          locationKey: location.canonicalKey,
          country: "Poland",
          city: "Synthetic",
          device: "desktop",
          serpDepth: 20,
          frequency: "manual",
          timezone: "UTC",
        },
      });
      await f.db.providerConnection.create({
        data: {
          projectId,
          publicId: makePublicId("conn"),
          kind: "serp",
          provider: "dataforseo",
          status: "connected",
          enabled: true,
        },
      });
      const current = await readHostDefinitionPolicy(
        f.db,
        f.project.writerContext,
        f.project.project.publicId,
      );
      await configureHostDefinitionPolicy(f.db, f.project.writerContext, {
        projectId: f.project.project.publicId,
        expectedPolicyEpoch: current.policyEpoch,
        manualTtlMs: null,
        cadenceGraceMs: null,
        confirmed: true,
      });
    }, 120000);
    afterEach(async () => {
      await f?.close();
      vi.unstubAllEnvs();
    });
    async function source(scheduleId: string | null = null) {
      return f.db.$transaction((tx) =>
        loadSettingsSource(tx, f.project.writerContext, f.project.project.publicId, scheduleId),
      );
    }
    it("intent audit retains only verified consent and replay/source refusal add no audit", async () => {
      const before = await readMeasurementSettingsHost(
        f.project.writerContext,
        f.project.project.publicId,
        null,
        f.db,
      );
      if (before.kind !== "ready") throw new Error("Synthetic setup unavailable");
      const auditBefore = await f.db.auditLog.count();
      await readMeasurementSettingsHost(
        f.project.writerContext,
        f.project.project.publicId,
        null,
        f.db,
      );
      expect(await f.db.auditLog.count()).toBe(auditBefore);
      const captured = await source();
      const selection = { ...before.snapshot.defaultIntent, depth: 50 };
      const intentEffect = settingsIntentEffect(captured, selection);
      const signed = signSettingsQuote(
        "intent",
        {
          projectId: captured.project.id,
          actorId: f.project.writerContext.actor.id,
          providerId: null,
          depth: 50,
          selection: { scheduleId: null, selection },
          source: {
            policyEpoch: captured.policy.policyEpoch,
            sourceHash: captured.sourceHash,
            selection,
            intentEffect,
          },
        },
        new Date(),
      );
      const command = {
        projectId: f.project.project.publicId,
        scheduleId: null,
        expectedRevision: before.snapshot.revision,
        expectedSourceHash: captured.sourceHash,
        selection,
        confirmed: true as const,
        idempotencyKey: "synthetic-original-defaults-save",
        previewToken: signed.token,
      };
      const result = await saveMeasurementIntentHost(f.project.writerContext, command, f.db);
      expect(result.defaultIntent.depth).toBe(50);
      expect(
        (await f.db.keyword.findUniqueOrThrow({ where: { id: f.observation.keyword.id } }))
          .locationId,
      ).toBe(f.observation.location.id);
      expect(await f.db.rankCheckRun.count({ where: { projectId: f.project.project.id } })).toBe(0);
      expect(await saveMeasurementIntentHost(f.project.writerContext, command, f.db)).toEqual(
        result,
      );
      expect(
        await f.db.measurementSettingsMutation.count({
          where: { projectId: f.project.project.id },
        }),
      ).toBe(1);
      const audit = await f.db.auditLog.findFirstOrThrow({
        where: { projectId: f.project.project.id, action: "settings.defaults.update" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit.after).toMatchObject({
        consent: {
          confirmed: true,
          purpose: "intent",
          outcome: "settings_saved",
          sourceDigest: captured.sourceHash,
          policyRevision: captured.policy.policyEpoch,
          impact: intentEffect,
          nativeEstimates: null,
        },
      });
      expect(JSON.stringify(audit.after)).not.toContain(signed.token);
      const auditCount = await f.db.auditLog.count();
      await f.db.project.update({
        where: { id: f.project.project.id },
        data: { domain: "changed.example.test" },
      });
      await expect(
        saveMeasurementIntentHost(
          f.project.writerContext,
          { ...command, idempotencyKey: "synthetic-fresh-key-old-source" },
          f.db,
        ),
      ).rejects.toMatchObject({ code: "settings_conflict" });
      expect(await f.db.auditLog.count()).toBe(auditCount);
    });
    it("schedule audit retains exact native forecast and same-key replay adds no audit", async () => {
      const schedule = await f.db.checkSchedule.create({
        data: {
          publicId: makePublicId("sch"),
          projectId: f.project.project.id,
          name: "Synthetic daily",
          frequency: "daily",
          timezone: "UTC",
          serpDepth: 20,
        },
      });
      await f.db.keyword.update({
        where: { id: f.observation.keyword.id },
        data: { checkScheduleId: schedule.id },
      });
      const read = await readMeasurementSettingsHost(
        f.project.writerContext,
        f.project.project.publicId,
        schedule.publicId,
        f.db,
      );
      if (read.kind !== "ready" || !read.snapshot.schedule)
        throw new Error("Synthetic schedule unavailable");
      const captured = await source(schedule.publicId),
        asOf = new Date(Math.floor(Date.now() / 1000) * 1000);
      const selection = { ...read.snapshot.selection, depth: 50 };
      const draft = { ...read.snapshot.schedule, enabled: false };
      const forecast = await f.db.$transaction((tx) =>
        settingsScheduleForecast(tx, captured, selection, draft, asOf, asOf),
      );
      if (!forecast || !forecast.calendar)
        throw new Error("Synthetic schedule forecast must include its calendar.");
      expect(forecast.calendar.targetScope?.targetCount).toBe(1);
      const signed = signSettingsQuote(
        "schedule",
        {
          projectId: captured.project.id,
          actorId: f.project.writerContext.actor.id,
          providerId: selection.providerId,
          depth: 50,
          selection: { selection, schedule: draft, scheduleId: schedule.publicId },
          source: {
            policyEpoch: captured.policy.policyEpoch,
            sourceHash: captured.sourceHash,
            forecast,
          },
        },
        asOf,
      );
      const command = {
        projectId: f.project.project.publicId,
        expectedRevision: read.snapshot.revision,
        expectedSourceHash: captured.sourceHash,
        selection,
        scheduleId: schedule.publicId,
        schedule: draft,
        confirmed: true as const,
        idempotencyKey: "synthetic-original-schedule-save",
        previewToken: signed.token,
      };
      const saved = await saveMeasurementScheduleHost(f.project.writerContext, command, f.db);
      const audit = await f.db.auditLog.findFirstOrThrow({
        where: { projectId: f.project.project.id, action: "check_schedule.update" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit.after).toMatchObject({
        consent: {
          confirmed: true,
          purpose: "schedule",
          policyRevision: captured.policy.policyEpoch,
          sourceDigest: captured.sourceHash,
          calendar: { dueOccurrences: forecast.calendar.dueOccurrences, targetCount: 1 },
          nativeEstimates: forecast.calendar.recurringEstimates,
        },
      });
      expect(JSON.stringify(audit.after)).not.toContain(signed.token);
      const auditCount = await f.db.auditLog.count();
      expect(saved.schedule?.enabled).toBe(false);
      expect(saved.selection.depth).toBe(50);
      expect(saved.defaultIntent.depth).toBe(20);
      expect(
        (await f.db.keyword.findUniqueOrThrow({ where: { id: f.observation.keyword.id } }))
          .checkScheduleId,
      ).toBe(schedule.id);
      expect(await saveMeasurementScheduleHost(f.project.writerContext, command, f.db)).toEqual(
        saved,
      );
      expect(await f.db.auditLog.count()).toBe(auditCount);
    });
  },
);
