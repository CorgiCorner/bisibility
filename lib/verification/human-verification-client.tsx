"use client";

import { type ReactNode, useCallback } from "react";

export type HumanVerificationFieldProps = {
  onToken: (token: string | null) => void;
  className?: string;
  ariaLabel?: string;
};

export type HumanVerificationState = {
  readonly token: string | null;
  readonly ok: boolean;
  readonly field: ReactNode;
  readonly reset: () => void;
};

/**
 * Self-host build: human verification is never required. The public forms
 * import this seam, so the self-host mirror never renders a challenge and
 * permits submission without a token.
 */
export function isHumanVerificationConfigured(): boolean {
  return false;
}

export function HumanVerificationField(_props: Readonly<HumanVerificationFieldProps>): null {
  return null;
}

export function useHumanVerification(): HumanVerificationState {
  const reset = useCallback(() => {}, []);
  return { field: null, ok: true, reset, token: null };
}
