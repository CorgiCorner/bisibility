import type { ProjectDefaults } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => {
  const state: { defaults: ProjectDefaults | null; persisted?: ProjectDefaults } = {
    defaults: null,
  };
  return { state, save: vi.fn(), preview: vi.fn() };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: { location: { findUnique: async () => null } } }));
vi.mock("@/lib/measurement-settings/host/defaults", async () => {
  const { prepareDefaultsDraft } = await import("@/lib/measurement-settings/host/defaults-source");
  const { defaultsRowForTest, defaultsSourceForTest } = await import(
    "@/lib/measurement-settings/host/defaults-source.test-fixture"
  );
  const { defaultsReviewSchema } = await import("@/lib/settings/reviewed-defaults-contract");
  const { publicProjectDefaults } = await import("@/lib/settings/project-defaults-config");
  const { prisma } = await import("@/lib/db/prisma");
  return {
    previewDefaultsHost: async (...args: unknown[]) => {
      f.preview(...args);
      const { defaultsRequestSchema } = await import("@/lib/settings/reviewed-defaults-contract");
      const request = defaultsRequestSchema.parse(args[1]);
      const prepared = await prepareDefaultsDraft(
        prisma,
        defaultsSourceForTest(f.state.defaults),
        request,
      );
      return {
        request,
        draft: prepared.draft,
        expectedRevision: "9007199254740993123",
        expectedSourceHash: "a".repeat(64),
        previewToken: "synthetic-transport-only",
        expiresAt: "2026-10-13T12:02:00.000Z",
        resolved: {
          locationKey: prepared.described.location.canonicalKey,
          label: prepared.described.location.displayName,
          languageCode: prepared.described.location.languageCode,
          device: prepared.draft.device,
        },
        impact: prepared.impact,
        policyReady: false,
      };
    },
    saveDefaultsHost: async (...args: unknown[]) => {
      f.save(...args);
      const [, request, review] = args;
      defaultsReviewSchema.parse(review);
      const { defaultsRequestSchema } = await import("@/lib/settings/reviewed-defaults-contract");
      const prepared = await prepareDefaultsDraft(
        prisma,
        defaultsSourceForTest(f.state.defaults),
        defaultsRequestSchema.parse(request),
      );
      const row = defaultsRowForTest({
        ...prepared.draft,
        ...(prepared.persistMarket ? prepared.described.market : {}),
        projectId: "project",
      });
      f.state.persisted = row;
      return {
        revision: "0",
        sourceHash: "b".repeat(64),
        value: publicProjectDefaults(row, `prj_${"a".repeat(24)}`),
        market: prepared.responseMarket,
        timestamps: {
          lastCheckedAt: null,
          nextCheckAt: null,
          updatedAt: new Date(0).toISOString(),
        },
      };
    },
  };
});

import { defaultsApiFixture } from "@/lib/measurement-settings/host/defaults-api.test-fixture";
import { defaultsRowForTest } from "@/lib/measurement-settings/host/defaults-source.test-fixture";
import { updateProjectDefaults } from "./project-defaults";

const ref = `prj_${"a".repeat(24)}`;
const schedule = {
  cron_expression: null,
  frequency: "manual",
  jitter_minutes: 0,
  serp_stop_on_match: false,
  timezone: "UTC",
};
const review = {
  expected_source_hash: "a".repeat(64),
  expected_revision: "9007199254740993123",
  preview_token: "synthetic-transport-only",
  idempotency_key: "synthetic-reviewed-api-command",
  confirmed: true,
};
async function patch(body: object) {
  const response = await updateProjectDefaults(defaultsApiFixture(ref, { ...body, review }), ref);
  return { status: response.status, body: await response.json(), stored: f.state.persisted };
}
/** Real parser/catalog and v1 route serialization; the host persistence/CAS is exercised in actual PG. */
describe("reviewed API keeps the legacy market/depth resource contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.state.defaults = null;
    delete f.state.persisted;
  });
  it("returns a bare snake-case preview of the parsed request without writing defaults", async () => {
    const response = await updateProjectDefaults(
      defaultsApiFixture(ref, { ...schedule, location_key: "DE", device: "mobile" }, true),
      ref,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      request: {
        kind: "patch",
        values: { ...schedule, project_id: ref, location_key: "DE", device: "mobile" },
      },
      draft: {
        ...schedule,
        project_id: ref,
        location_key: "DE",
        device: "mobile",
        city: null,
        country: "Germany",
        serp_depth: 100,
      },
      expected_revision: "9007199254740993123",
      expected_source_hash: "a".repeat(64),
      preview_token: "synthetic-transport-only",
      expires_at: "2026-10-13T12:02:00.000Z",
      resolved: { location_key: "DE", label: "Germany", language_code: "de", device: "mobile" },
      impact: {
        existing_target_retargets: 0,
        new_targets: 0,
        inherited_depth_targets: 0,
        recurring_estimate: "unchanged",
        scope_changed: true,
        cadence_changed: false,
      },
      policy_ready: false,
    });
    expect(f.save).not.toHaveBeenCalled();
    expect(f.state.persisted).toBeUndefined();
    expect(f.preview).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { id: "key" } }),
      expect.objectContaining({ kind: "patch" }),
    );
  });
  it.each(["Germany", "de"])(
    "resolves legacy %s and canonical location_key identically",
    async (country) => {
      const legacy = await patch({ ...schedule, country, device: "mobile" });
      const modern = await patch({ ...schedule, location_key: "DE", device: "mobile" });
      expect(legacy.status).toBe(200);
      expect(modern).toEqual(legacy);
      expect(legacy.stored).toMatchObject({
        country: "Germany",
        device: "mobile",
        locationKey: "DE",
      });
      expect(legacy.body).toMatchObject({
        country: "Germany",
        device: "mobile",
        location_key: "DE",
      });
      expect(f.save).toHaveBeenCalledWith(
        expect.objectContaining({ actor: { id: "key" }, auditActorId: null }),
        expect.objectContaining({ kind: "patch" }),
        expect.objectContaining({ confirmed: true, expectedRevision: review.expected_revision }),
      );
    },
  );
  it("accepts deprecated cadence without changing stored cadence or enabling recurrence", async () => {
    f.state.defaults = defaultsRowForTest({
      frequency: "weekly",
      cronExpression: "0 6 * * 1",
      jitterMinutes: 31,
      timezone: "Europe/Warsaw",
    });
    const result = await patch({
      frequency: "daily",
      cron_expression: null,
      timezone: "UTC",
      jitter_minutes: 0,
      serp_depth: 20,
    });
    expect(result.status).toBe(200);
    expect(result.stored).toMatchObject({
      frequency: "weekly",
      cronExpression: "0 6 * * 1",
      jitterMinutes: 31,
      timezone: "Europe/Warsaw",
      serpDepth: 20,
    });
    expect(result.body).toMatchObject({
      frequency: "manual",
      next_check_at: null,
      cron_expression: null,
      jitter_minutes: 0,
    });
  });
  it("ignores an incomplete deprecated custom cron input instead of treating it as active scheduling", async () => {
    const result = await patch({ frequency: "custom_cron", serp_depth: 20 });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ frequency: "manual", next_check_at: null, serp_depth: 20 });
    expect(result.stored).toMatchObject({ frequency: "manual", cronExpression: null });
  });
  it("keeps stored depth when PATCH omits it", async () => {
    f.state.defaults = defaultsRowForTest({ serpDepth: 20, serpStopOnMatch: false });
    const result = await patch(schedule);
    expect(result.status).toBe(200);
    expect(result.stored?.serpDepth).toBe(20);
    expect(result.body).toMatchObject({ serp_depth: 20 });
  });
  it("returns the effective Top20 no-stop policy without rewriting the stored preference", async () => {
    f.state.defaults = defaultsRowForTest({ serpDepth: 20, serpStopOnMatch: true });
    const result = await patch({ serp_stop_on_match: true });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ serp_depth: 20, serp_stop_on_match: false });
    expect(result.stored?.serpStopOnMatch).toBe(true);
  });
  it("uses the schema default depth for no stored defaults", async () => {
    const result = await patch(schedule);
    expect(result.stored?.serpDepth).toBe(100);
  });
  it("resolves an explicit depth without coercing opaque revision strings", async () => {
    const result = await patch({ ...schedule, serp_depth: 50 });
    expect(result.stored?.serpDepth).toBe(50);
    expect(result.body).toMatchObject({ serp_depth: 50 });
  });
});
