import { validateReturnTo } from "@/lib/auth/return-to";
import { SIGNED_IN_HOME_PATH, TWO_FACTOR_CHALLENGE_PATH } from "@/lib/auth/two-factor-routes";

function safeRedirectUrl(url: string, origin: string) {
  try {
    const target = new URL(url, origin);
    return target.protocol === "http:" || target.protocol === "https:" ? target.toString() : null;
  } catch {
    return null;
  }
}

function twoFactorChallengePath(returnTo?: string) {
  const destination = validateReturnTo(returnTo);

  if (!destination || destination === SIGNED_IN_HOME_PATH) {
    return TWO_FACTOR_CHALLENGE_PATH;
  }

  const params = new URLSearchParams({ next: destination });
  return `${TWO_FACTOR_CHALLENGE_PATH}?${params.toString()}`;
}

export function signInRedirectUrl(response: unknown, origin: string, returnTo?: string) {
  const payloads = [(response as { data?: unknown } | null)?.data, response];

  for (const payload of payloads) {
    const maybeRedirect = payload as {
      redirect?: unknown;
      twoFactorRedirect?: unknown;
      url?: unknown;
    } | null;

    if (maybeRedirect?.twoFactorRedirect === true) {
      return safeRedirectUrl(twoFactorChallengePath(returnTo), origin);
    }

    if (maybeRedirect?.redirect === true && typeof maybeRedirect.url === "string") {
      return safeRedirectUrl(maybeRedirect.url, origin);
    }
  }

  return null;
}
