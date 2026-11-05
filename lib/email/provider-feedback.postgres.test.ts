import { randomUUID } from "node:crypto";
import { deliverPreparedEmail } from "@/lib/alerts/prepared-email-delivery";
import { prismaPreparedEmailStore } from "@/lib/alerts/prepared-email-store";
import { makePublicId } from "@/lib/db/public-id";
import { reserveEmailDailyBudget } from "@/lib/email/budget";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import {
  sendWelcomeEmailActivity,
  sendWelcomeFollowupActivity,
} from "@/lib/temporal/welcome-email-activity";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { applyMailProviderFeedback, assertMailNotSuppressed } from "./provider-feedback-store";
import { sendEmail } from "./send";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient, send: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: vi.fn() }));
vi.mock("./instance-mail-store", () => ({
  refreshInstanceMailRuntime: vi.fn(async () => undefined),
}));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = shared.send;
  },
  SendEmailCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
beforeAll(async () => {
  fixture = await closeoutPostgresFixture();
  shared.db = fixture.db;
  vi.stubEnv("EMAIL_PROVIDER", "ses");
  vi.stubEnv("SES_REGION", "eu-central-1");
  vi.stubEnv("EMAIL_FROM", "sender@example.com");
  vi.stubEnv("DEMO_MODE", "");
  vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("SITE_URL", "https://app.example.com");
}, 90_000);
afterEach(() => {
  vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "");
  vi.restoreAllMocks();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (fixture) await fixture.close();
});
it("correlates accepted mail, atomically deduplicates feedback, and blocks later bulk sends", async () => {
  const messageId = randomUUID();
  const to = `${randomUUID()}@example.com`;
  const input = {
    category: "bulk" as const,
    dailyBudgetReserved: true,
    html: "body",
    subject: "subject",
    text: "body",
    to,
  };
  shared.send.mockResolvedValueOnce({ MessageId: messageId });
  await sendEmail(input);
  expect(
    await shared.db.mailProviderReceipt.findUnique({
      where: { provider_messageId: { provider: "ses", messageId } },
    }),
  ).toMatchObject({ recipient: to });
  const event = {
    eventId: randomUUID(),
    provider: "ses",
    messageId,
    recipients: [to],
    kind: "bounce" as const,
  };
  expect(
    await applyMailProviderFeedback({
      ...event,
      eventId: randomUUID(),
      recipients: ["other@example.org"],
    }),
  ).toBe("processed");
  expect(
    await applyMailProviderFeedback({ ...event, eventId: randomUUID(), kind: "transient" }),
  ).toBe("processed");
  expect(await shared.db.mailSuppression.findUnique({ where: { recipient: to } })).toBeNull();
  expect(await applyMailProviderFeedback({ ...event, messageId: "missing" })).toBe(
    "missing_receipt",
  );
  expect(await applyMailProviderFeedback(event)).toBe("processed");
  expect(await applyMailProviderFeedback(event)).toBe("duplicate");
  expect(await shared.db.mailFeedbackEvent.count({ where: { id: event.eventId } })).toBe(1);
  await shared.db.mailProviderReceipt.deleteMany({ where: { provider: "ses", messageId } });
  expect(await applyMailProviderFeedback(event)).toBe("duplicate");
  expect(await shared.db.mailSuppression.findUnique({ where: { recipient: to } })).toMatchObject({
    reason: "bounce",
  });
  shared.send.mockClear();
  await expect(sendEmail(input)).rejects.toThrow("suppressed");
  expect(shared.send).not.toHaveBeenCalled();
  shared.send.mockResolvedValueOnce({ MessageId: randomUUID() });
  await sendEmail({ ...input, category: "transactional" });
  expect(shared.send).toHaveBeenCalledOnce();
});

it("suppresses complaint recipients exactly once under concurrent replay", async () => {
  const to = `${randomUUID()}@example.org`;
  const messageId = randomUUID();
  await shared.db.mailProviderReceipt.create({
    data: { provider: "ses", messageId, recipient: to },
  });
  const event = {
    eventId: randomUUID(),
    provider: "ses",
    messageId,
    kind: "complaint" as const,
    recipients: [to],
  };
  // Hold the insert lock until both transactions have read the missing event.
  await fixture.client.query("BEGIN");
  await fixture.client.query('LOCK TABLE "mail_feedback_events" IN SHARE MODE');
  const attempts = Promise.allSettled([
    applyMailProviderFeedback(event),
    applyMailProviderFeedback(event),
  ]);
  let blocked = 0;
  try {
    for (let i = 0; i < 80; i++) {
      const result = await fixture.client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_locks WHERE NOT granted AND relation = 'mail_feedback_events'::regclass",
      );
      blocked = Number(result.rows[0]?.count ?? 0);
      if (blocked >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    await fixture.client.query("COMMIT");
  }
  const outcomes = await attempts;
  expect(blocked).toBeGreaterThanOrEqual(2);
  expect(
    outcomes.map((outcome) => (outcome.status === "fulfilled" ? outcome.value : "rejected")).sort(),
  ).toEqual(["duplicate", "processed"]);
  expect(await shared.db.mailFeedbackEvent.count({ where: { id: event.eventId } })).toBe(1);
  expect(await shared.db.mailSuppression.findUnique({ where: { recipient: to } })).toMatchObject({
    reason: "complaint",
  });
});

it("preserves a one-message bulk allowance for an eligible recipient", async () => {
  vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "1");
  await shared.db.emailDailyStat.deleteMany({ where: { category: "bulk" } });
  const blocked = `${randomUUID()}@example.com`;
  await shared.db.mailSuppression.create({ data: { recipient: blocked, reason: "bounce" } });
  const input = {
    category: "bulk" as const,
    html: "body",
    subject: "subject",
    text: "body",
    to: blocked,
  };
  shared.send.mockClear();
  await expect(sendEmail(input)).rejects.toThrow("suppressed");
  expect(await shared.db.emailDailyStat.count({ where: { category: "bulk" } })).toBe(0);
  shared.send.mockResolvedValueOnce({ MessageId: randomUUID() });
  await sendEmail({ ...input, to: `${randomUUID()}@example.org` });
  expect(shared.send).toHaveBeenCalledOnce();
  vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "");
});

it.each([sendWelcomeEmailActivity, sendWelcomeFollowupActivity])(
  "retains the welcome claim after accepted mail cannot be recorded",
  async (activity) => {
    const user = await shared.db.user.create({
      data: { email: `${randomUUID()}@example.com`, name: "Test", publicId: makePublicId("usr") },
    });
    shared.send.mockClear();
    shared.send.mockResolvedValueOnce({ MessageId: randomUUID() });
    const receipt = vi
      .spyOn(shared.db.mailProviderReceipt, "create")
      .mockRejectedValueOnce(new Error("receipt unavailable"));
    await expect(activity({ userId: user.id })).resolves.toEqual({ status: "unknown" });
    receipt.mockRestore();
    await activity({ userId: user.id });
    expect(shared.send).toHaveBeenCalledOnce();
  },
);

it("skips a suppressed welcome follow-up", async () => {
  const email = `${randomUUID()}@example.org`;
  const user = await shared.db.user.create({
    data: { email, name: "Test", publicId: makePublicId("usr") },
  });
  await shared.db.mailSuppression.create({ data: { recipient: email, reason: "bounce" } });
  shared.send.mockClear();
  await expect(sendWelcomeFollowupActivity({ userId: user.id })).resolves.toEqual({
    status: "suppressed",
  });
  expect(shared.send).not.toHaveBeenCalled();
});

it("leaves the real bulk allowance available after a suppressed prepared delivery", async () => {
  vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "1");
  await shared.db.emailDailyStat.deleteMany({ where: { category: "bulk" } });
  const blocked = `${randomUUID()}@example.com`;
  await shared.db.mailSuppression.create({ data: { recipient: blocked, reason: "bounce" } });
  const run = (to: string) =>
    deliverPreparedEmail({
      checkSuppression: assertMailNotSuppressed,
      identity: randomUUID(),
      record: async () => undefined,
      releaseUnconsumedBudgetClaim: (id) =>
        prismaPreparedEmailStore.releaseUnconsumedBudgetClaim(id),
      render: () => ({
        from: "sender@example.com",
        headers: {},
        html: "body",
        listUnsubscribeUrl: "https://example.com/unsubscribe",
        subject: "subject",
        text: "body",
        to,
      }),
      reserveBudget: () => reserveEmailDailyBudget("bulk"),
      send: (message, claimProviderSend) =>
        sendEmail({ ...message, category: "bulk", claimProviderSend }),
      store: prismaPreparedEmailStore,
      transport: { id: "ses", idempotent: false },
    });
  shared.send.mockClear();
  await expect(run(blocked)).rejects.toThrow("suppressed");
  expect(await shared.db.emailDailyStat.count({ where: { category: "bulk" } })).toBe(0);
  shared.send.mockResolvedValueOnce({ MessageId: randomUUID() });
  await expect(run(`${randomUUID()}@example.org`)).resolves.toMatchObject({ delivered: true });
  expect(shared.send).toHaveBeenCalledOnce();
});

it.each([sendWelcomeEmailActivity, sendWelcomeFollowupActivity])(
  "releases a welcome claim after a definite provider rejection",
  async (activity) => {
    const user = await shared.db.user.create({
      data: { email: `${randomUUID()}@example.com`, name: "Test", publicId: makePublicId("usr") },
    });
    shared.send.mockReset();
    shared.send.mockRejectedValueOnce(
      Object.assign(new Error("rejected"), { $metadata: { httpStatusCode: 400 } }),
    );
    shared.send.mockResolvedValueOnce({ MessageId: randomUUID() });
    await expect(activity({ userId: user.id })).rejects.toMatchObject({ ambiguous: false });
    await expect(activity({ userId: user.id })).resolves.toEqual({ status: "sent" });
    expect(shared.send).toHaveBeenCalledTimes(2);
  },
);
