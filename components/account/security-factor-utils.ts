export function secretFromTotpUri(totpURI: string) {
  try {
    return new URL(totpURI).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

export function factorStatusKey(enabled: boolean) {
  return enabled ? "enabled" : "notEnabled";
}

export function passwordActionKey(pending: boolean, mode: string | null) {
  if (pending) return "working";
  return mode === "setup" ? "continue" : "confirm";
}

export function twoFactorErrorKey(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (message === "No password credential found") return "passwordUnavailable";
  }
  return "updateError";
}
