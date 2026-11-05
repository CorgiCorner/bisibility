import { createHash } from "node:crypto";

export const UNKNOWN_EMAIL_RESOLUTION =
  "Confirm this message with the mail provider before any manual resend. Automatic retry is disabled.";

export type PreparedEmailState =
  | "accepted"
  | "failed"
  | "prepared"
  | "skipped"
  | "submitting"
  | "unknown";

export type PreparedEmailBody = {
  from: string;
  headers: Record<string, string>;
  html: string;
  listUnsubscribeUrl: string;
  subject: string;
  text: string;
  to: string;
};

export type PreparedEmailRecord = PreparedEmailBody & {
  budgetReserved: boolean;
  deliveryIdentity: string;
  /** Canonical digest inputs for audit. Null for a single-alert message. Never indexed. */
  deliveryInputs: string | null;
  idempotencyKey: string;
  idempotent: boolean;
  providerCode: string | null;
  providerId: string | null;
  state: PreparedEmailState;
};

export type PreparedEmailStore = {
  claimBudget(identity: string): Promise<boolean>;
  compareAndSet(
    identity: string,
    from: PreparedEmailState,
    patch: Partial<PreparedEmailRecord>,
  ): Promise<boolean>;
  find(identity: string): Promise<PreparedEmailRecord | null>;
  insert(record: PreparedEmailRecord): Promise<PreparedEmailRecord | "conflict">;
  releaseUnconsumedBudgetClaim(identity: string): Promise<void>;
};

export type PreparedEmailOutcome = {
  delivered: boolean;
  reason?: string;
  skipped: boolean;
  unknown?: boolean;
};

type AttemptStatus = "failed" | "sent" | "skipped" | "unknown";

export type PreparedEmailTransport = { id: string; idempotent: boolean } | null;

export type PreparedEmailDelivery = {
  checkSuppression: (recipient: string) => Promise<void>;
  identity: string;
  identityInputs?: string | null;
  record: (status: AttemptStatus, error: string | null) => Promise<void>;
  releaseUnconsumedBudgetClaim: (identity: string) => Promise<void>;
  render: () => PreparedEmailBody;
  reserveBudget: () => Promise<{ day: Date; granted: boolean; limit: number }>;
  send: (
    message: PreparedEmailBody & { dailyBudgetReserved: boolean; idempotencyKey?: string },
    claimProviderSend: () => Promise<void>,
  ) => Promise<void>;
  store: PreparedEmailStore;
  transport: PreparedEmailTransport;
};

const retainedBudget = new Set<PreparedEmailState>([
  "accepted",
  "failed",
  "prepared",
  "skipped",
  "submitting",
  "unknown",
]);

export function shouldReleaseEmailBudget(state: PreparedEmailState) {
  return !retainedBudget.has(state);
}

const indexedDigestIdentity = /^[0-9a-f]{64}$/;

export function alertEmailIdentity(alertId: string, userId: string) {
  return `alert:${alertId}:email:${userId}`;
}

export function assertIndexedDigestIdentity(identity: string) {
  if (!indexedDigestIdentity.test(identity)) {
    throw new Error("Digest delivery identity must be a 64 character sha256 hex key.");
  }
}

/** Versioned encoding of rule id, sorted alert ids, and user id. Not stored in the unique index. */
export function digestEmailCanonicalEncoding(input: {
  alertIds: readonly string[];
  ruleId: string;
  userId: string;
}) {
  const alertIds = [...input.alertIds].sort();
  return [
    "v1",
    `rule:${input.ruleId.length}:${input.ruleId}`,
    `user:${input.userId.length}:${input.userId}`,
    ...alertIds.map((id) => `alert:${id.length}:${id}`),
  ].join("\n");
}

export function digestEmailIdentity(input: {
  alertIds: readonly string[];
  ruleId: string;
  userId: string;
}) {
  const identity = createHash("sha256").update(digestEmailCanonicalEncoding(input)).digest("hex");
  assertIndexedDigestIdentity(identity);
  return identity;
}

export function emailIdempotencyKey(identity: string) {
  return createHash("sha256").update(identity).digest("hex");
}

export class RecordedDeliveryError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Email delivery failed.");
    this.name = "RecordedDeliveryError";
    this.cause = cause;
  }
}

export class EmailAttemptLogError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Email attempt log failed.");
    this.name = "EmailAttemptLogError";
    this.cause = cause;
  }
}

export function isForeignKeyConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2003",
  );
}
