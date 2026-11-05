export const EMAIL_PROVIDER_IDS = ["resend", "ses", "smtp"] as const;
export const SUPPORTED_EMAIL_PROVIDERS = EMAIL_PROVIDER_IDS.join(", ");

export type EmailProviderId = (typeof EMAIL_PROVIDER_IDS)[number];
export type EmailCategory = "bulk" | "transactional";

export type EmailMessage = {
  from: string;
  html: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  replyTo?: string;
  sendCounterReserved?: boolean;
  subject: string;
  text: string;
  to: string;
};

export type EmailProvider = {
  readonly id: EmailProviderId;
  readonly label: string;
  /** True when the transport has the credentials it needs. */
  isConfigured(): boolean;
  /** Delivers one message or throws EmailSendError. Never retries internally. */
  send(message: EmailMessage): Promise<void> | Promise<{ messageId: string | null }>;
};

export class EmailSendError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  readonly providerCode: string | null;
  readonly ambiguous: boolean;

  constructor(
    message: string,
    status: number,
    retryAfterSeconds: number | null,
    details?: { ambiguous?: boolean; providerCode?: string | null },
  ) {
    super(message);
    this.name = "EmailSendError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.providerCode = details?.providerCode ?? null;
    this.ambiguous = details?.ambiguous ?? false;
  }
}

export class EmailBudgetExceededError extends Error {
  readonly category: EmailCategory;
  readonly day: Date;
  readonly limit: number;

  constructor(category: EmailCategory, limit: number, day: Date) {
    const utcDate = day.toISOString().slice(0, 10);
    super(
      `Daily ${category} email budget of ${limit} recipient sends is exhausted for ${utcDate} UTC.`,
    );
    this.name = "EmailBudgetExceededError";
    this.category = category;
    this.day = day;
    this.limit = limit;
  }
}

/** No mail transport is available; carries no credentials or provider configuration. */
export class EmailProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailProviderUnavailableError";
  }
}

/** Raised only before calling a transport; safe to retry without a handoff. */
export class EmailNotSubmittedError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Email preparation failed.", { cause });
    this.name = "EmailNotSubmittedError";
  }
}

/** A bulk recipient is blocked before provider submission. */
export class EmailSuppressedError extends Error {
  constructor() {
    super("Bulk email recipient is suppressed.");
    this.name = "EmailSuppressedError";
  }
}
