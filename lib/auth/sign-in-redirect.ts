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

// Mirrors the oauth-provider client: only the parameters named in `ba_param`, plus the
// signature itself, belong to the signed authorize request.
function signedOAuthParams(search?: string) {
  const params = new URLSearchParams(search);
  const signedNames = new Set(params.getAll("ba_param"));
  const signed = new URLSearchParams();

  if (!params.has("sig") || signedNames.size === 0) {
    return signed;
  }

  for (const [key, value] of params) {
    if (key === "sig" || key === "ba_param" || signedNames.has(key)) {
      signed.append(key, value);
    }
  }

  return signed;
}

function twoFactorChallengePath(returnTo?: string, oauthSearch?: string) {
  const destination = validateReturnTo(returnTo);
  // The second factor is what creates the session, so the challenge page must keep the
  // signed authorize request; the oauth-provider client resends it with the verify call.
  const params = signedOAuthParams(oauthSearch);

  if (destination && destination !== SIGNED_IN_HOME_PATH) {
    params.set("next", destination);
  }

  const query = params.toString();
  return query ? `${TWO_FACTOR_CHALLENGE_PATH}?${query}` : TWO_FACTOR_CHALLENGE_PATH;
}

export function signInRedirectUrl(
  response: unknown,
  origin: string,
  returnTo?: string,
  oauthSearch?: string,
) {
  const payloads = [(response as { data?: unknown } | null)?.data, response];

  for (const payload of payloads) {
    const maybeRedirect = payload as {
      redirect?: unknown;
      twoFactorRedirect?: unknown;
      url?: unknown;
    } | null;

    if (maybeRedirect?.twoFactorRedirect === true) {
      return safeRedirectUrl(twoFactorChallengePath(returnTo, oauthSearch), origin);
    }

    if (maybeRedirect?.redirect === true && typeof maybeRedirect.url === "string") {
      return safeRedirectUrl(maybeRedirect.url, origin);
    }
  }

  return null;
}
