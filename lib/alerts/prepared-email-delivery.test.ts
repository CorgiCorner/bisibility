import { createHash } from "node:crypto";
import { EmailSendError, EmailSuppressedError } from "@/lib/email/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
  alertEmailIdentity,
  deliverPreparedEmail,
  digestEmailIdentity,
  emailIdempotencyKey,
  type PreparedEmailRecord,
  type PreparedEmailStore,
  RecordedDeliveryError,
  shouldReleaseEmailBudget,
  UNKNOWN_EMAIL_RESOLUTION,
} from "./prepared-email-delivery";

const frozen = {
  from: "bisibility <alerts@example.com>",
  headers: {
    "List-Unsubscribe": "<https://example.com/unsubscribe?token=once>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
  html: "<p>Ranking dropped</p>",
  listUnsubscribeUrl: "https://example.com/unsubscribe?token=once",
  subject: "[bisibility] Ranking dropped",
  text: "Ranking dropped",
  to: "owner@example.com",
};

function memoryStore(): PreparedEmailStore & { rows: Map<string, PreparedEmailRecord> } {
  const rows = new Map<string, PreparedEmailRecord>();
  return {
    rows,
    async find(identity) {
      const row = rows.get(identity);
      return row ? { ...row, headers: { ...row.headers } } : null;
    },
    async insert(record) {
      if (rows.has(record.deliveryIdentity)) return "conflict";
      rows.set(record.deliveryIdentity, { ...record, headers: { ...record.headers } });
      return { ...record };
    },
    async compareAndSet(identity, from, patch) {
      const row = rows.get(identity);
      if (!row || row.state !== from) return false;
      if (patch.idempotencyKey && patch.idempotencyKey !== row.idempotencyKey) return false;
      Object.assign(row, patch);
      return true;
    },
    async claimBudget(identity) {
      const row = rows.get(identity);
      if (!row || row.budgetReserved) return false;
      row.budgetReserved = true;
      return true;
    },
    async releaseUnconsumedBudgetClaim(identity) {
      const row = rows.get(identity);
      if (!row) return;
      row.budgetReserved = false;
    },
  };
}

function harness(store = memoryStore()) {
  const sent: unknown[] = [];
  const recorded: Array<{ status: string; error: string | null }> = [];
  const counts = { releases: 0, renders: 0, reserves: 0 };
  const transport = { id: "resend" as const, idempotent: true };
  const send = async (message: unknown, claimProviderSend?: () => Promise<void>) => {
    await claimProviderSend?.();
    sent.push(message);
  };
  const run = (overrides: Partial<Parameters<typeof deliverPreparedEmail>[0]> = {}) =>
    deliverPreparedEmail({
      checkSuppression: async () => undefined,
      identity: alertEmailIdentity("alert_1", "user_1"),
      render: () => {
        counts.renders += 1;
        return frozen;
      },
      transport,
      send,
      reserveBudget: async () => {
        counts.reserves += 1;
        return { day: new Date("2026-11-03T00:00:00.000Z"), granted: true, limit: 1000 };
      },
      releaseUnconsumedBudgetClaim: async (identity) => {
        counts.releases += 1;
        await store.releaseUnconsumedBudgetClaim(identity);
      },
      record: async (status, error) => {
        recorded.push({ error, status });
      },
      store,
      ...overrides,
    });
  return { counts, recorded, run, send, sent, store, transport };
}

describe("prepared email delivery", () => {
  let fx: ReturnType<typeof harness>;

  beforeEach(() => {
    fx = harness();
  });

  it("checks suppression before reserving a prepared delivery", async () => {
    const checkSuppression = async () => {
      throw new EmailSuppressedError();
    };
    await expect(fx.run({ checkSuppression })).rejects.toBeInstanceOf(EmailSuppressedError);
    expect(fx.counts.reserves).toBe(0);
    expect(fx.sent).toHaveLength(0);
    await fx.run({ checkSuppression: async () => undefined });
    expect(fx.counts.reserves).toBe(1);
    expect(fx.sent).toHaveLength(1);
  });

  it("positive control: sends the frozen alert once and records sent", async () => {
    await expect(fx.run()).resolves.toEqual({ delivered: true, skipped: false });
    expect(fx.sent).toHaveLength(1);
    expect(fx.counts.renders).toBe(1);
    expect(fx.recorded).toEqual([{ error: null, status: "sent" }]);
    expect(fx.counts.reserves).toBe(1);
    expect(fx.store.rows.get(alertEmailIdentity("alert_1", "user_1"))?.state).toBe("accepted");
  });

  it("does not send again when the sent-attempt log fails and then succeeds", async () => {
    let logs = 0;
    fx = harness();
    const record = async (
      status: "failed" | "sent" | "skipped" | "unknown",
      error: string | null,
    ) => {
      logs += 1;
      if (logs === 1) throw new Error("database temporarily unavailable");
      fx.recorded.push({ error, status });
    };
    await expect(fx.run({ record })).rejects.toThrow("database temporarily unavailable");
    await fx.run({ record });
    expect(fx.sent).toHaveLength(1);
    expect(fx.recorded.map((entry) => entry.status)).toEqual(["sent"]);
  });

  it("retries an idempotent transport with the same payload and key", async () => {
    let attempt = 0;
    const send = async (message: unknown, claimProviderSend?: () => Promise<void>) => {
      await claimProviderSend?.();
      attempt += 1;
      fx.sent.push(message);
      if (attempt === 1) throw new EmailSendError("Resend send failed with status 503.", 503, null);
    };
    await expect(fx.run({ send })).rejects.toBeInstanceOf(RecordedDeliveryError);
    await fx.run({ send });
    expect(fx.counts.renders).toBe(1);
    expect(fx.sent).toHaveLength(2);
    expect(fx.sent[0]).toEqual(fx.sent[1]);
    expect(fx.counts.reserves).toBe(1);
    const key = emailIdempotencyKey(alertEmailIdentity("alert_1", "user_1"));
    expect(key).toBe(
      createHash("sha256").update(alertEmailIdentity("alert_1", "user_1")).digest("hex"),
    );
    expect(JSON.stringify(fx.recorded)).not.toContain(key);
  });

  it("treats a Resend payload mismatch as permanent and keeps the original key", async () => {
    const mismatch = new EmailSendError("Resend send failed with status 409.", 409, null, {
      providerCode: "invalid_idempotent_request",
    });
    const send = async (message: unknown, claimProviderSend?: () => Promise<void>) => {
      await claimProviderSend?.();
      fx.sent.push(message);
      throw mismatch;
    };
    await expect(fx.run({ send })).rejects.toBeInstanceOf(RecordedDeliveryError);
    await expect(fx.run({ send })).rejects.toBeInstanceOf(RecordedDeliveryError);
    expect(fx.sent).toHaveLength(1);
    const row = fx.store.rows.get(alertEmailIdentity("alert_1", "user_1"));
    expect(row?.idempotencyKey).toBe(emailIdempotencyKey(alertEmailIdentity("alert_1", "user_1")));
    expect(row?.state).toBe("failed");
    expect(row?.providerCode).toBe("invalid_idempotent_request");
  });

  it("retries a concurrent Resend conflict with the same payload and key", async () => {
    let attempt = 0;
    const send = async (message: unknown, claimProviderSend?: () => Promise<void>) => {
      await claimProviderSend?.();
      attempt += 1;
      fx.sent.push(message);
      if (attempt === 1) {
        throw new EmailSendError("Resend send failed with status 409.", 409, null, {
          providerCode: "concurrent_idempotent_requests",
        });
      }
    };
    await expect(fx.run({ send })).rejects.toMatchObject({
      providerCode: "concurrent_idempotent_requests",
      status: 409,
    });
    await fx.run({ send });
    expect(fx.sent).toHaveLength(2);
    expect(fx.sent[0]).toEqual(fx.sent[1]);
    expect(fx.store.rows.get(alertEmailIdentity("alert_1", "user_1"))?.state).toBe("accepted");
  });

  it("records unknown and does not resend after a non-idempotent timeout", async () => {
    const send = async (message: unknown, claimProviderSend?: () => Promise<void>) => {
      await claimProviderSend?.();
      fx.sent.push(message);
      throw new EmailSendError("SES send failed with status 500 (TimeoutError).", 500, null, {
        ambiguous: true,
      });
    };
    await expect(fx.run({ send, transport: { id: "ses", idempotent: false } })).resolves.toEqual({
      delivered: false,
      reason: UNKNOWN_EMAIL_RESOLUTION,
      skipped: false,
      unknown: true,
    });
    await fx.run({ send, transport: { id: "ses", idempotent: false } });
    expect(fx.sent).toHaveLength(1);
    expect(fx.recorded).toEqual([
      { error: UNKNOWN_EMAIL_RESOLUTION, status: "unknown" },
      { error: UNKNOWN_EMAIL_RESOLUTION, status: "unknown" },
    ]);
    expect(fx.counts.releases).toBe(0);
    expect(shouldReleaseEmailBudget("unknown")).toBe(false);
    expect(fx.counts.reserves).toBe(1);
  });

  it("sends a deleted alert at most once and then skips", async () => {
    const record = async () => {
      throw Object.assign(new Error("missing triggered alert foreign key"), { code: "P2003" });
    };
    await expect(fx.run({ record })).resolves.toMatchObject({ skipped: true });
    await expect(fx.run({ record })).resolves.toMatchObject({ skipped: true });
    expect(fx.sent).toHaveLength(1);
  });

  it("keys a digest by rule, sorted alert ids, and recipient", () => {
    const identity = digestEmailIdentity({
      alertIds: ["alert_b", "alert_a"],
      ruleId: "rule_1",
      userId: "user_1",
    });
    expect(identity).toBe(
      digestEmailIdentity({ alertIds: ["alert_a", "alert_b"], ruleId: "rule_1", userId: "user_1" }),
    );
    expect(identity).toMatch(/^[0-9a-f]{64}$/);
    expect(identity).not.toContain("alert_a");
    expect(
      digestEmailIdentity({ alertIds: ["alert_a", "alert_b"], ruleId: "rule_2", userId: "user_1" }),
    ).not.toBe(identity);
    expect(
      digestEmailIdentity({ alertIds: ["alert_a"], ruleId: "rule_1", userId: "user_2" }),
    ).not.toBe(identity);
  });

  it("sends a separate digest for each rule that shares a recipient", async () => {
    const first = digestEmailIdentity({
      alertIds: ["alert_1"],
      ruleId: "rule_1",
      userId: "user_1",
    });
    const second = digestEmailIdentity({
      alertIds: ["alert_2"],
      ruleId: "rule_2",
      userId: "user_1",
    });
    await fx.run({ identity: first, render: () => ({ ...frozen, subject: "Rule one" }) });
    await fx.run({ identity: second, render: () => ({ ...frozen, subject: "Rule two" }) });
    expect(fx.sent).toHaveLength(2);
    expect(fx.sent).toEqual([
      expect.objectContaining({ subject: "Rule one" }),
      expect.objectContaining({ subject: "Rule two" }),
    ]);
  });

  it("does not send a logical digest that is accepted, unknown, or submitting", async () => {
    const identity = digestEmailIdentity({
      alertIds: ["alert_b", "alert_a"],
      ruleId: "rule_1",
      userId: "user_1",
    });
    const transport = { id: "ses", idempotent: false };
    await fx.run({ identity, transport });
    expect(fx.sent).toHaveLength(1);
    const row = fx.store.rows.get(identity);
    if (!row) throw new Error("missing digest row");
    row.state = "unknown";
    await fx.run({ identity, transport });
    expect(fx.sent).toHaveLength(1);
    row.state = "submitting";
    row.idempotent = false;
    await expect(fx.run({ identity, transport })).resolves.toMatchObject({ unknown: true });
    expect(fx.sent).toHaveLength(1);
  });

  it("sends on retry when the worker dies before the provider claim", async () => {
    const identity = alertEmailIdentity("alert_1", "user_1");
    const transport = { id: "ses", idempotent: false };
    const send = async () => {
      expect(fx.store.rows.get(identity)?.state).toBe("prepared");
      throw new Error("killed before provider claim");
    };
    await expect(fx.run({ send, transport })).rejects.toThrow("killed before provider claim");
    expect(fx.store.rows.get(identity)?.state).toBe("prepared");
    expect(fx.sent).toHaveLength(0);
    await fx.run({ transport });
    expect(fx.sent).toHaveLength(1);
    expect(fx.store.rows.get(identity)?.state).toBe("accepted");
  });
});
