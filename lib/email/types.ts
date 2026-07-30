export const EMAIL_PROVIDER_IDS = ["resend", "ses", "smtp"] as const;
export const SUPPORTED_EMAIL_PROVIDERS = EMAIL_PROVIDER_IDS.join(", ");

export type EmailProviderId = (typeof EMAIL_PROVIDER_IDS)[number];
export type EmailCategory = "bulk" | "transactional";

export type EmailMessage = {
  from: string;
  html: string;
  sendCounterReserved?: boolean;
  subject: string;
  text: string;
  to: string;
};

export type EmailProvider = {
  readonly id: EmailProviderId;
  readonly label: string;
  /** True when every environment key the transport needs is present. */
  isConfigured(): boolean;
  /** Delivers one message or throws EmailSendError. Never retries internally. */
  send(message: EmailMessage): Promise<void>;
};

export class EmailSendError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null) {
    super(message);
    this.name = "EmailSendError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
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
