import { TWO_FACTOR_CHALLENGE_PATH } from "@/lib/auth/two-factor-routes";

function safeRedirectUrl(url: string, origin: string) {
  try {
    const target = new URL(url, origin);
    return target.protocol === "http:" || target.protocol === "https:" ? target.toString() : null;
  } catch {
    return null;
  }
}

export function signInRedirectUrl(response: unknown, origin: string) {
  const payloads = [(response as { data?: unknown } | null)?.data, response];

  for (const payload of payloads) {
    const maybeRedirect = payload as {
      redirect?: unknown;
      twoFactorRedirect?: unknown;
      url?: unknown;
    } | null;

    if (maybeRedirect?.twoFactorRedirect === true) {
      return safeRedirectUrl(TWO_FACTOR_CHALLENGE_PATH, origin);
    }

    if (maybeRedirect?.redirect === true && typeof maybeRedirect.url === "string") {
      return safeRedirectUrl(maybeRedirect.url, origin);
    }
  }

  return null;
}
