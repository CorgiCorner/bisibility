import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/auth/authorize";
import { businessLocationDatabase } from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { z } from "zod";

const state = vi.hoisted(() => ({
  db: null as PrismaClient | null,
  project: null as { id: string; publicId: string } | null,
  actor: null as Actor | null,
  failAudit: false,
  failAfterAudit: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    if (!state.db) throw new Error("fixture unavailable");
    return state.db;
  },
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => state.actor,
  parseActionInput: (schema: z.ZodType, input: unknown) => schema.parse(input),
  requireProjectScope: async () => state.project,
  revalidateAlertViews: vi.fn(),
  revalidateSettingsViews: vi.fn(),
}));
vi.mock("@/lib/auth/audit", async (original) => {
  const actual = await original<typeof import("@/lib/auth/audit")>();
  return {
    ...actual,
    writeAudit: async (...args: Parameters<typeof actual.writeAudit>) => {
      if (state.failAudit) throw new Error("injected audit failure");
      const row = await actual.writeAudit(...args);
      if (state.failAfterAudit) throw new Error("injected failure after audit insert");
      return row;
    },
  };
});

import { updateNotificationPreferences } from "@/lib/actions/notification-prefs";
import {
  createAlertRuleRecord,
  deleteAlertRuleRecord,
  updateAlertRuleRecord,
} from "@/lib/api/alert-service";

let fixture: Awaited<ReturnType<typeof businessLocationDatabase>>;
let projectId: string, userId: string, projectPublicId: string;
const form = () => ({
  projectId: projectPublicId,
  requestId: makePublicId("alr"),
  name: "Fixture rule",
  conditionType: "threshold" as const,
  thresholdPosition: 10,
  enabled: true,
  targetType: "all" as const,
  targetIds: [],
  marketIds: [],
  recipientIds: [],
  channels: [],
});

beforeAll(async () => {
  fixture = await businessLocationDatabase();
  state.db = fixture.db;
  const user = await fixture.db.user.create({
    data: { publicId: makePublicId("usr"), name: "Fixture", email: `${randomUUID()}@example.com` },
  });
  const project = await fixture.db.project.create({
    data: {
      publicId: makePublicId("prj"),
      ownerId: user.id,
      name: "Fixture",
      domain: "example.com",
    },
  });
  userId = user.id;
  projectId = project.id;
  projectPublicId = project.publicId;
  state.project = project;
  state.actor = { id: user.id, role: "member", memberships: [{ projectId, role: "member" }] };
  await fixture.db.webhookEndpoint.createMany({
    data: [true, false].map((enabled) => ({
      publicId: makePublicId("we"),
      projectId,
      enabled,
      url: "https://example.org/",
      hmacSecret: "fixture",
    })),
  });
}, 120000);
afterAll(async () => {
  await fixture?.close();
});

const auditCount = (action: string) => fixture.db.auditLog.count({ where: { action, projectId } });

async function withFault<T>(key: "failAudit" | "failAfterAudit", work: () => Promise<T>) {
  state[key] = true;
  try {
    return await work();
  } finally {
    state[key] = false;
  }
}

it("keeps endpoint choices during personal off/on and returns persisted state on audit failure", async () => {
  await updateNotificationPreferences({ projectId: projectPublicId, alertEmail: false });
  await updateNotificationPreferences({ projectId: projectPublicId, alertEmail: true });
  expect(
    (
      await fixture.db.webhookEndpoint.findMany({
        where: { projectId },
        orderBy: { enabled: "asc" },
      })
    ).map((e) => e.enabled),
  ).toEqual([false, true]);
  state.failAudit = true;
  try {
    const result = await updateNotificationPreferences({
      projectId: projectPublicId,
      alertEmail: false,
    });
    expect(result).toMatchObject({ saveFailed: true, alertEmail: true });
    expect(
      (
        await fixture.db.notificationPreference.findUniqueOrThrow({
          where: { userId_projectId: { userId, projectId } },
        })
      ).alertEmail,
    ).toBe(true);
  } finally {
    state.failAudit = false;
  }
});

it("rolls back create on audit failure and resubmits only one rule", async () => {
  const input = form();
  const context = { actorId: userId, projectId };
  state.failAudit = true;
  try {
    await expect(createAlertRuleRecord(input, context)).rejects.toThrow("injected audit failure");
  } finally {
    state.failAudit = false;
  }
  expect(await fixture.db.alertRule.count({ where: { publicId: input.requestId } })).toBe(0);
  await createAlertRuleRecord(input, context);
  await createAlertRuleRecord(input, context);
  expect(await fixture.db.alertRule.count({ where: { publicId: input.requestId } })).toBe(1);
});

it("does not treat another actor's request identity as a successful retry", async () => {
  const input = form();
  await createAlertRuleRecord(input, { actorId: userId, projectId });
  const other = await fixture.db.user.create({
    data: { publicId: makePublicId("usr"), name: "Fixture", email: `${randomUUID()}@example.org` },
  });
  await expect(createAlertRuleRecord(input, { actorId: other.id, projectId })).rejects.toThrow();
  expect(await fixture.db.alertRule.count({ where: { publicId: input.requestId } })).toBe(1);
});

it("recovers a committed create whose response was lost", async () => {
  const input = form();
  const context = { actorId: userId, projectId };
  const transaction = fixture.db.$transaction.bind(fixture.db);
  const spy = vi.spyOn(fixture.db, "$transaction").mockImplementationOnce((async (
    work: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) => {
    await transaction(work);
    throw new Error("response lost");
  }) as unknown as typeof fixture.db.$transaction);
  try {
    await expect(createAlertRuleRecord(input, context)).rejects.toThrow("response lost");
  } finally {
    spy.mockRestore();
  }
  const result = await createAlertRuleRecord(input, context);
  expect(result.publicId).toBe(input.requestId);
  expect(await fixture.db.alertRule.count({ where: { publicId: input.requestId } })).toBe(1);
});

it("rolls back delete and update when auditing fails", async () => {
  const input = form();
  const context = { actorId: userId, projectId };
  const rule = await createAlertRuleRecord(input, context);
  state.failAudit = true;
  try {
    await expect(deleteAlertRuleRecord({ ruleId: rule.publicId }, context)).rejects.toThrow(
      "injected audit failure",
    );
    await expect(
      updateAlertRuleRecord({ ...input, ruleId: rule.publicId, name: "Changed" }, context),
    ).rejects.toThrow("injected audit failure");
  } finally {
    state.failAudit = false;
  }
  expect(
    await fixture.db.alertRule.findUniqueOrThrow({ where: { publicId: rule.publicId } }),
  ).toMatchObject({ name: "Fixture rule" });
  await deleteAlertRuleRecord({ ruleId: rule.publicId }, context);
  expect(await fixture.db.alertRule.findUnique({ where: { publicId: rule.publicId } })).toBeNull();
});

it("ignores legacy project channel fields on a personal write and warns", async () => {
  const result = await updateNotificationPreferences({
    projectId: projectPublicId,
    alertSlack: true,
    alertWebhook: true,
  });
  expect(result).toMatchObject({
    warnings: [{ field: "alert_slack" }, { field: "alert_webhook" }],
  });
  expect(
    (
      await fixture.db.webhookEndpoint.findMany({
        where: { projectId },
        orderBy: { enabled: "asc" },
      })
    ).map((e) => e.enabled),
  ).toEqual([false, true]);
});

it("rolls back the preference and its audit row together when the audit step fails late", async () => {
  await updateNotificationPreferences({ projectId: projectPublicId, inviteEmail: true });
  const before = await auditCount("notification_preferences.update");
  const result = await withFault("failAfterAudit", () =>
    updateNotificationPreferences({ projectId: projectPublicId, inviteEmail: false }),
  );
  expect(result).toMatchObject({ saveFailed: true, inviteEmail: true });
  expect(await auditCount("notification_preferences.update")).toBe(before);
  await updateNotificationPreferences({ projectId: projectPublicId, inviteEmail: false });
  expect(await auditCount("notification_preferences.update")).toBe(before + 1);
});

it("never leaves a rule without its audit row, or an audit row without its rule", async () => {
  const input = form();
  const context = { actorId: userId, projectId };
  const creates = await auditCount("alert_rule.create");
  await expect(
    withFault("failAfterAudit", () => createAlertRuleRecord(input, context)),
  ).rejects.toThrow("injected failure after audit insert");
  expect(await fixture.db.alertRule.count({ where: { publicId: input.requestId } })).toBe(0);
  expect(await auditCount("alert_rule.create")).toBe(creates);

  const rule = await createAlertRuleRecord(input, context);
  expect(await auditCount("alert_rule.create")).toBe(creates + 1);

  const deletes = await auditCount("alert_rule.delete");
  await expect(
    withFault("failAfterAudit", () => deleteAlertRuleRecord({ ruleId: rule.publicId }, context)),
  ).rejects.toThrow("injected failure after audit insert");
  expect(await fixture.db.alertRule.count({ where: { publicId: rule.publicId } })).toBe(1);
  expect(await auditCount("alert_rule.delete")).toBe(deletes);
});
