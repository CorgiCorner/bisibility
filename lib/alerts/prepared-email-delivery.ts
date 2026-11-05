import { AlertDeliverySkipped } from "@/lib/alerts/send-gate";
import { RESEND_CONCURRENT_REQUEST, RESEND_PAYLOAD_MISMATCH } from "@/lib/email/idempotency";
import { EmailBudgetExceededError, EmailSendError, EmailSuppressedError } from "@/lib/email/types";
import { permanentHttpStatus } from "@/lib/temporal/delivery-failures";
import {
  EmailAttemptLogError,
  emailIdempotencyKey,
  isForeignKeyConstraintError,
  type PreparedEmailDelivery,
  type PreparedEmailOutcome,
  type PreparedEmailRecord,
  type PreparedEmailTransport,
  RecordedDeliveryError,
  shouldReleaseEmailBudget,
  UNKNOWN_EMAIL_RESOLUTION,
} from "./prepared-email-contract";

export type {
  PreparedEmailBody,
  PreparedEmailDelivery,
  PreparedEmailOutcome,
  PreparedEmailRecord,
  PreparedEmailState,
  PreparedEmailStore,
} from "./prepared-email-contract";
export {
  alertEmailIdentity,
  assertIndexedDigestIdentity,
  digestEmailCanonicalEncoding,
  digestEmailIdentity,
  EmailAttemptLogError,
  emailIdempotencyKey,
  isForeignKeyConstraintError,
  RecordedDeliveryError,
  shouldReleaseEmailBudget,
  UNKNOWN_EMAIL_RESOLUTION,
} from "./prepared-email-contract";

function deletedOutcome(): PreparedEmailOutcome {
  return { delivered: false, reason: "Triggered alert was deleted.", skipped: true };
}

function unknownOutcome(): PreparedEmailOutcome {
  return {
    delivered: false,
    reason: UNKNOWN_EMAIL_RESOLUTION,
    skipped: false,
    unknown: true,
  };
}

function isAmbiguousTransportError(error: unknown) {
  if (error instanceof EmailSendError && error.ambiguous) return true;
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    code === "ECONNRESET" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ETIMEDOUT"
  );
}

async function logAttempt(
  input: PreparedEmailDelivery,
  status: "failed" | "sent" | "skipped" | "unknown",
  error: string | null,
) {
  try {
    await input.record(status, error);
    return "ok" as const;
  } catch (caught) {
    if (isForeignKeyConstraintError(caught)) return "deleted" as const;
    throw new EmailAttemptLogError(caught);
  }
}

async function loadOrCreate(input: PreparedEmailDelivery) {
  const existing = await input.store.find(input.identity);
  if (existing) return existing;
  const rendered = input.render();
  const record: PreparedEmailRecord = {
    ...rendered,
    budgetReserved: false,
    deliveryIdentity: input.identity,
    deliveryInputs: input.identityInputs ?? null,
    idempotencyKey: emailIdempotencyKey(input.identity),
    idempotent: false,
    providerCode: null,
    providerId: null,
    state: "prepared",
  };
  const inserted = await input.store.insert(record);
  if (inserted !== "conflict") return inserted;
  const raced = await input.store.find(input.identity);
  if (!raced) throw new Error("Prepared email is missing.");
  return raced;
}

async function reserveOnce(input: PreparedEmailDelivery, row: PreparedEmailRecord) {
  if (row.budgetReserved || !input.transport) return;
  const claimed = await input.store.claimBudget(row.deliveryIdentity);
  if (!claimed) return;
  try {
    const reservation = await input.reserveBudget();
    if (!reservation.granted) {
      await input.releaseUnconsumedBudgetClaim(row.deliveryIdentity);
      throw new EmailBudgetExceededError("bulk", reservation.limit, reservation.day);
    }
  } catch (error) {
    if (!(error instanceof EmailBudgetExceededError)) {
      await input.releaseUnconsumedBudgetClaim(row.deliveryIdentity);
    }
    throw error;
  }
}

function outbound(row: PreparedEmailRecord, transport: PreparedEmailTransport) {
  const idempotent = row.idempotent || Boolean(transport?.idempotent);
  return {
    dailyBudgetReserved: row.budgetReserved,
    from: row.from,
    headers: row.headers,
    html: row.html,
    ...(idempotent ? { idempotencyKey: row.idempotencyKey } : {}),
    listUnsubscribeUrl: row.listUnsubscribeUrl,
    subject: row.subject,
    text: row.text,
    to: row.to,
  };
}

async function markUnknown(input: PreparedEmailDelivery, row: PreparedEmailRecord) {
  if (shouldReleaseEmailBudget("unknown")) {
    await input.releaseUnconsumedBudgetClaim(row.deliveryIdentity);
  }
  await input.store.compareAndSet(row.deliveryIdentity, row.state, { state: "unknown" });
  const logged = await logAttempt(input, "unknown", UNKNOWN_EMAIL_RESOLUTION);
  return logged === "deleted" ? deletedOutcome() : unknownOutcome();
}

async function rejectPermanent(
  input: PreparedEmailDelivery,
  row: PreparedEmailRecord,
  error: EmailSendError,
) {
  await input.store.compareAndSet(row.deliveryIdentity, "submitting", {
    providerCode: error.providerCode,
    state: "failed",
  });
  await logAttempt(input, "failed", error.message);
  throw new RecordedDeliveryError(error);
}

async function handleSendError(
  input: PreparedEmailDelivery,
  row: PreparedEmailRecord,
  error: unknown,
) {
  if (error instanceof EmailBudgetExceededError) throw error;
  if (row.state !== "submitting") throw error;
  if (error instanceof AlertDeliverySkipped || error instanceof EmailSuppressedError) {
    await input.store.compareAndSet(row.deliveryIdentity, "submitting", { state: "prepared" });
    throw error;
  }
  if (error instanceof EmailSendError && error.providerCode === RESEND_CONCURRENT_REQUEST) {
    throw error;
  }
  if (error instanceof EmailSendError && error.providerCode === RESEND_PAYLOAD_MISMATCH) {
    await rejectPermanent(input, row, error);
  }
  if (isAmbiguousTransportError(error)) {
    if (row.idempotent) throw error;
    return markUnknown(input, row);
  }
  if (error instanceof EmailSendError && permanentHttpStatus(error.status, error.providerCode)) {
    await rejectPermanent(input, row, error);
  }
  await input.store.compareAndSet(row.deliveryIdentity, "submitting", { state: "prepared" });
  const message = error instanceof Error ? error.message : "Email delivery failed.";
  await logAttempt(input, "failed", message);
  throw new RecordedDeliveryError(error);
}

async function claimProviderSend(input: PreparedEmailDelivery, held: { row: PreparedEmailRecord }) {
  if (held.row.state !== "prepared") return;
  const moved = await input.store.compareAndSet(held.row.deliveryIdentity, "prepared", {
    idempotent: input.transport?.idempotent ?? false,
    providerId: input.transport?.id ?? null,
    state: "submitting",
  });
  if (!moved) throw new Error("Prepared email state changed.");
  held.row = {
    ...held.row,
    idempotent: input.transport?.idempotent ?? false,
    providerId: input.transport?.id ?? null,
    state: "submitting",
  };
}

export async function deliverPreparedEmail(
  input: PreparedEmailDelivery,
): Promise<PreparedEmailOutcome> {
  const row = await loadOrCreate(input);
  if (row.state === "accepted") {
    const logged = await logAttempt(input, "sent", null);
    return logged === "deleted" ? deletedOutcome() : { delivered: true, skipped: false };
  }
  if (row.state === "unknown") {
    const logged = await logAttempt(input, "unknown", UNKNOWN_EMAIL_RESOLUTION);
    return logged === "deleted" ? deletedOutcome() : unknownOutcome();
  }
  if (row.state === "skipped") return deletedOutcome();
  if (row.state === "failed") {
    const error = new EmailSendError("Email delivery was rejected.", 409, null, {
      providerCode: row.providerCode,
    });
    await logAttempt(input, "failed", error.message);
    throw new RecordedDeliveryError(error);
  }
  if (row.state === "submitting" && !row.idempotent) return markUnknown(input, row);

  const held = {
    row:
      row.state === "prepared"
        ? { ...row, budgetReserved: row.budgetReserved || Boolean(input.transport) }
        : row,
  };
  if (row.state === "prepared") {
    if (!row.budgetReserved && input.transport) await input.checkSuppression(row.to);
    await reserveOnce(input, row);
  }

  try {
    await input.send(outbound(held.row, input.transport), () => claimProviderSend(input, held));
  } catch (error) {
    return handleSendError(input, held.row, error);
  }

  const accepted = await input.store.compareAndSet(held.row.deliveryIdentity, "submitting", {
    state: "accepted",
  });
  if (!accepted) throw new Error("Prepared email acceptance was not stored.");
  const logged = await logAttempt(input, "sent", null);
  return logged === "deleted" ? deletedOutcome() : { delivered: true, skipped: false };
}
