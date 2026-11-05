import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consent: true,
  prisma: {
    user: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    membership: { findMany: vi.fn() },
    notificationPreference: { findMany: vi.fn() },
    triggeredAlert: { findMany: vi.fn() },
    deliveryAttempt: { create: vi.fn() },
    preparedEmailMessage: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/email/from", () => ({ alertsEmailFrom: () => "alerts@example.com" }));
vi.mock("@/lib/email/notification-unsubscribe", () => ({
  notificationUnsubscribeUrl: () => "https://example.com/unsubscribe",
  notificationUnsubscribeFooter: (content: unknown) => content,
}));
vi.mock("@/lib/seo/origin", () => ({ resolveCanonicalOrigin: () => "https://example.com" }));

import { deliverAlertDigestEmailActivity } from "@/lib/alerts/digest-delivery";
import { filterAlertEmailRecipients } from "@/lib/alerts/recipients";
import { alertDeliveryAllowed } from "@/lib/alerts/send-gate";
import { deliverAlertEmailActivity } from "@/lib/temporal/alert-delivery-channels";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consent = true;
  mocks.prisma.user.findUnique.mockResolvedValue({ id: "user_1", email: "person@example.com" });
  mocks.prisma.project.findUnique.mockResolvedValue({ id: "project_1", ownerId: "user_1" });
  mocks.prisma.membership.findMany.mockResolvedValue([{ userId: "user_1" }]);
  mocks.prisma.notificationPreference.findMany.mockImplementation(async () => [
    { userId: "user_1", alertEmail: mocks.consent },
  ]);
  mocks.prisma.triggeredAlert.findMany.mockResolvedValue([
    { id: "alert_1", digestSubmissionStarted: false },
  ]);
  mocks.prisma.deliveryAttempt.create.mockResolvedValue({});
  const rows = new Map<string, Record<string, unknown>>();
  mocks.prisma.preparedEmailMessage.findUnique.mockImplementation(async ({ where }) => {
    const row = rows.get(where.deliveryIdentity);
    return row ? { ...row } : null;
  });
  mocks.prisma.preparedEmailMessage.create.mockImplementation(async ({ data }) => {
    const row = { id: "prepared_1", ...data };
    rows.set(data.deliveryIdentity, row);
    return row;
  });
  mocks.prisma.preparedEmailMessage.updateMany.mockImplementation(async ({ data, where }) => {
    const row = rows.get(where.deliveryIdentity);
    if (!row) return { count: 0 };
    if (where.state && row.state !== where.state) return { count: 0 };
    if (where.budgetReserved !== undefined && row.budgetReserved !== where.budgetReserved) {
      return { count: 0 };
    }
    Object.assign(row, data);
    return { count: 1 };
  });
});

it("skips an email if consent is revoked after recipient preparation", async () => {
  const recipients = await filterAlertEmailRecipients("project_1", [
    { userId: "user_1", email: "person@example.com" },
  ]);
  expect(recipients).toHaveLength(1);
  mocks.consent = false;
  const result = await deliverAlertEmailActivity({
    alertId: "alert_1",
    projectInternalId: "project_1",
    ruleId: "rule_1",
    recipientUserId: recipients[0]?.userId,
    recipientEmail: recipients[0]?.email,
    payload: { projectId: "prj_test", headline: "Rank changed", action: "Review it" } as never,
  } as never);
  expect(result).toMatchObject({ delivered: false, skipped: true });
  expect(mocks.sendEmail).not.toHaveBeenCalled();
  expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ status: "skipped", triggeredAlertId: "alert_1" }),
  });
});

it("refuses if consent changes during email preparation before transport", async () => {
  mocks.sendEmail.mockImplementation(async (input) => {
    mocks.consent = false;
    await input.beforeProviderSend({ to: input.to });
  });
  const result = await deliverAlertEmailActivity({
    alertId: "alert_1",
    projectInternalId: "project_1",
    ruleId: "rule_1",
    recipientUserId: "user_1",
    recipientEmail: "person@example.com",
    payload: { projectId: "prj_test", headline: "Rank changed", action: "Review it" } as never,
  });
  expect(result).toMatchObject({ delivered: false, skipped: true });
  expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ status: "skipped" }),
  });
});

it("refuses a digest if consent changes during email preparation", async () => {
  mocks.sendEmail.mockImplementation(async (input) => {
    mocks.consent = false;
    await input.beforeProviderSend({ to: input.to });
  });
  const result = await deliverAlertDigestEmailActivity({
    job: {
      alertIds: ["alert_1"],
      deliveryClaimToken: "fixture-claim",
      projectId: "project_1",
      ruleId: "rule_1",
      email: { text: "Digest", html: "<p>Digest</p>", subject: "Digest" },
    } as never,
    recipient: { userId: "user_1", email: "person@example.com" },
  });
  expect(result).toMatchObject({ delivered: false, skipped: true });
});

it("refuses an empty alert set", async () => {
  mocks.prisma.triggeredAlert.findMany.mockResolvedValue([]);
  expect(await alertDeliveryAllowed({ alertIds: [] })).toEqual([]);
});
