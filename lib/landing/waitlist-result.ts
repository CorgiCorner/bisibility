export type WaitlistFailureCode = "rate_limited" | "verification_failed";

export type WaitlistFailureResult = {
  code: WaitlistFailureCode;
  ok: false;
};

export type WaitlistSuccessResult = {
  changed: boolean;
  email: string;
  ok: true;
};

export type WaitlistActionResult = WaitlistFailureResult | WaitlistSuccessResult;

export class WaitlistProtectionError extends Error {
  constructor(
    readonly code: WaitlistFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "WaitlistProtectionError";
  }
}

export function waitlistFailureResult(error: unknown): WaitlistFailureResult | null {
  if (!(error instanceof WaitlistProtectionError)) {
    return null;
  }
  return { code: error.code, ok: false };
}
