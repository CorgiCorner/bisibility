export function secretFromTotpUri(totpURI: string) {
  try {
    return new URL(totpURI).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

export function factorStatusLabel(enabled: boolean) {
  return enabled ? "Enabled" : "Not enabled";
}

export function passwordActionLabel(pending: boolean, mode: string | null) {
  if (pending) return "Working";
  return mode === "setup" ? "Continue" : "Confirm";
}

export function twoFactorErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      if (message === "No password credential found") {
        return "This account does not have a password credential yet.";
      }
      return message;
    }
  }
  return "Two-factor authentication could not be updated.";
}
