import "server-only";

import { type AppLocale, resolveViewerLocale } from "@/i18n/config";
import { readLocaleCookie } from "@/i18n/locale-preference.server";
import {
  PREFERENCE_COOKIES,
  parsePreferences,
  resolveStoredDateFormat,
  type UserPreferences,
} from "@/lib/account/preferences-shared";
import { requireSession } from "@/lib/auth/session";
import { gravatarUrl } from "@/lib/avatar/gravatar";
import type { DateFormatPreference } from "@/lib/dates/format";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { cookies, headers } from "next/headers";
import { cache } from "react";

export type ConnectedAccount = {
  connected: boolean;
  provider: "github" | "google";
};

export type ActiveSession = {
  browser: "Edge" | "Chrome" | "Firefox" | "Safari" | null;
  current: boolean;
  id: string;
  ipAddress: string | null;
  lastActiveAt: Date;
  operatingSystem: "macOS" | "Windows" | "Android" | "iOS" | "Linux" | null;
};

export type AccountView = {
  avatarUrl: string;
  connectedAccounts: ConnectedAccount[];
  email: string;
  emailVerified: boolean;
  hasPasswordCredential: boolean;
  image: string | null;
  name: string;
  publicId: string;
  sessions: ActiveSession[];
  twoFactorEnabled: boolean;
};

// Tiny user-agent reduction: enough to describe a session row, no UA-parsing dependency.
function deviceFromUserAgent(
  userAgent: string | null,
): Pick<ActiveSession, "browser" | "operatingSystem"> {
  const operatingSystems = [
    { label: "macOS", pattern: /Mac OS X|Macintosh/ },
    { label: "Windows", pattern: /Windows/ },
    { label: "Android", pattern: /Android/ },
    { label: "iOS", pattern: /iPhone|iPad|iOS/ },
    { label: "Linux", pattern: /Linux/ },
  ] as const;
  const browsers = [
    { label: "Edge", pattern: /Edg\// },
    { label: "Chrome", pattern: /Chrome\// },
    { label: "Firefox", pattern: /Firefox\// },
    { label: "Safari", pattern: /Safari\// },
  ] as const;
  const operatingSystem =
    operatingSystems.find(({ pattern }) => userAgent && pattern.test(userAgent))?.label ?? null;
  const browser =
    browsers.find(({ pattern }) => userAgent && pattern.test(userAgent))?.label ?? null;
  return { browser, operatingSystem };
}

function requiredPublicId(value: string | null, prefix: "sid" | "usr", resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

export async function getAccount(): Promise<AccountView> {
  const session = await requireSession();
  const [user, accounts, sessions] = await Promise.all([
    prisma.user.findUnique({
      select: {
        email: true,
        emailVerified: true,
        image: true,
        name: true,
        publicId: true,
        twoFactorEnabled: true,
      },
      where: { id: session.user.id },
    }),
    prisma.account.findMany({
      select: { password: true, providerId: true },
      where: { userId: session.user.id },
    }),
    prisma.session.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        createdAt: true,
        id: true,
        ipAddress: true,
        publicId: true,
        updatedAt: true,
        userAgent: true,
      },
      where: { userId: session.user.id },
    }),
  ]);

  const linked = new Set(accounts.map((account) => account.providerId));
  const connectedAccounts: ConnectedAccount[] = (["github", "google"] as const).map((provider) => ({
    connected: linked.has(provider),
    provider,
  }));

  if (!user?.publicId || sessions.some((row) => !row.publicId)) {
    throw new Error("Public ID migration is incomplete.");
  }

  return {
    avatarUrl: gravatarUrl(user?.email ?? session.user.email, 54),
    connectedAccounts,
    email: user?.email ?? session.user.email,
    emailVerified: user?.emailVerified ?? false,
    hasPasswordCredential: accounts.some(
      (account) => account.providerId === "credential" && Boolean(account.password),
    ),
    image: user?.image ?? null,
    name: user?.name ?? session.user.name ?? "",
    publicId: requiredPublicId(user.publicId, "usr", "User"),
    sessions: sessions.map((row) => ({
      current: row.id === session.session.id,
      ...deviceFromUserAgent(row.userAgent),
      id: requiredPublicId(row.publicId, "sid", "Session"),
      ipAddress: row.ipAddress?.trim() || null,
      lastActiveAt: row.updatedAt,
    })),
    twoFactorEnabled: user?.twoFactorEnabled ?? false,
  };
}

/**
 * Density, landing, and theme live in cookies; date format lives on the user row.
 * A legacy date-format cookie still wins while the column is at its `auto` default, so
 * readers who already picked ISO/EU/long do not silently fall back to Auto.
 */
export async function getPreferences(): Promise<UserPreferences> {
  const session = await requireSession();
  const [store, user] = await Promise.all([
    cookies(),
    prisma.user.findUnique({
      select: { dateFormat: true },
      where: { id: session.user.id },
    }),
  ]);
  const stored = user?.dateFormat ?? "auto";
  const cookieFormat = store.get(PREFERENCE_COOKIES.dateFormat)?.value;
  const dateFormat = stored === "auto" ? (resolveStoredDateFormat(cookieFormat) ?? stored) : stored;
  return parsePreferences({
    dateFormat,
    density: store.get(PREFERENCE_COOKIES.density)?.value,
    landing: store.get(PREFERENCE_COOKIES.landing)?.value,
    theme: store.get(PREFERENCE_COOKIES.theme)?.value,
  });
}

export async function persistDateFormatPreference(
  userId: string,
  dateFormat: DateFormatPreference,
) {
  const existing = await prisma.user.findUnique({
    select: { dateFormat: true, publicId: true },
    where: { id: userId },
  });
  if (!existing?.publicId) {
    throw new Error("User public ID is not available.");
  }

  const previousFormat = resolveStoredDateFormat(existing.dateFormat) ?? "auto";
  if (previousFormat === dateFormat) {
    return { changed: false, publicId: existing.publicId, previousFormat };
  }

  await prisma.user.update({
    data: { dateFormat },
    where: { id: userId },
  });
  return { changed: true, publicId: existing.publicId, previousFormat };
}

export async function getLocalePreference() {
  const session = await requireSession();
  return getLocalePreferenceForUser(session.user.id);
}

const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

/** Resolves a signed-in locale once for every request that needs it. */
export const getLocalePreferenceForUser = perRequestCache(async (userId: string) => {
  const [cookieLocale, requestHeaders, user] = await Promise.all([
    readLocaleCookie(),
    headers(),
    prisma.user.findUnique({
      select: { uiLocale: true, uiLocaleSelectedAt: true },
      where: { id: userId },
    }),
  ]);

  const acceptLanguage = requestHeaders.get("accept-language");
  return {
    ...resolveViewerLocale({
      acceptLanguage,
      cookieLocale,
      persistedLocale: user?.uiLocale,
      persistedLocaleSelectedAt: user?.uiLocaleSelectedAt,
    }),
    acceptLanguage,
  };
});

export async function persistUiLocalePreference(userId: string, uiLocale: AppLocale) {
  const existing = await prisma.user.findUnique({
    select: { publicId: true, uiLocale: true, uiLocaleSelectedAt: true },
    where: { id: userId },
  });
  if (!existing?.publicId) {
    throw new Error("User public ID is not available.");
  }

  const changed = existing.uiLocale !== uiLocale || !existing.uiLocaleSelectedAt;
  if (changed) {
    await prisma.user.update({
      data: { uiLocale, uiLocaleSelectedAt: new Date() },
      where: { id: userId },
    });
  }

  return { changed, previousLocale: existing.uiLocale, publicId: existing.publicId };
}
