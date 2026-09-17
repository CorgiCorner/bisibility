import "server-only";

import { cookies } from "next/headers";
import { type AppLocale, parseLocale, UI_LOCALE_COOKIE } from "./config";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const UI_LOCALE_COOKIE_OPTIONS = {
  maxAge: COOKIE_MAX_AGE,
  path: "/",
  sameSite: "lax" as const,
};

/** Reads Better Auth's request cookie without depending on Next request storage. */
export function localeFromAuthContext(context: unknown): AppLocale | undefined {
  const getCookie =
    typeof context === "object" && context !== null && "getCookie" in context
      ? (context as { getCookie?: unknown }).getCookie
      : undefined;
  return parseLocale(typeof getCookie === "function" ? getCookie(UI_LOCALE_COOKIE) : undefined);
}

/**
 * Only an explicit anonymous choice is copied during account creation. Omitting
 * these fields leaves Prisma's English default intact without overwriting a choice.
 */
export function localeFieldsForNewUser(context: unknown, now = new Date()) {
  const locale = localeFromAuthContext(context);
  return locale ? { uiLocale: locale, uiLocaleSelectedAt: now } : {};
}

export async function readLocaleCookie() {
  return parseLocale((await cookies()).get(UI_LOCALE_COOKIE)?.value);
}

export async function writeLocaleCookie(locale: AppLocale) {
  (await cookies()).set(UI_LOCALE_COOKIE, locale, {
    ...UI_LOCALE_COOKIE_OPTIONS,
  });
}
