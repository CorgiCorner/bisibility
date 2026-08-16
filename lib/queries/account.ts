import "server-only";

import {
  PREFERENCE_COOKIES,
  parsePreferences,
  type UserPreferences,
} from "@/lib/account/preferences-shared";
import { requireSession } from "@/lib/auth/session";
import { gravatarUrl } from "@/lib/avatar/gravatar";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { cookies } from "next/headers";

export type ConnectedAccount = {
  connected: boolean;
  detail: string;
  provider: "github" | "google";
};

export type ActiveSession = {
  createdLabel: string;
  current: boolean;
  device: string;
  id: string;
  location: string;
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

function relativeLabel(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) {
    return "active just now";
  }
  if (minutes < 60) {
    return `active ${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `active ${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `active ${days}d ago`;
}

// Tiny user-agent reduction: enough to label a session row, no UA-parsing dependency.
function deviceFromUserAgent(userAgent: string | null): string {
  if (!userAgent) {
    return "Unknown device";
  }
  const os =
    [
      { label: "macOS", pattern: /Mac OS X|Macintosh/ },
      { label: "Windows", pattern: /Windows/ },
      { label: "Android", pattern: /Android/ },
      { label: "iOS", pattern: /iPhone|iPad|iOS/ },
      { label: "Linux", pattern: /Linux/ },
    ].find(({ pattern }) => pattern.test(userAgent))?.label ?? "Unknown";
  const browser =
    [
      { label: "Edge", pattern: /Edg\// },
      { label: "Chrome", pattern: /Chrome\// },
      { label: "Firefox", pattern: /Firefox\// },
      { label: "Safari", pattern: /Safari\// },
    ].find(({ pattern }) => pattern.test(userAgent))?.label ?? "Browser";
  return `${browser} on ${os}`;
}

function requiredPublicId(value: string | null, prefix: "sid" | "usr", resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

const PROVIDER_LABEL = { github: "GitHub", google: "Google" } as const;

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
    detail: linked.has(provider)
      ? `Connected to ${PROVIDER_LABEL[provider]}`
      : "Not connected. Sign-in is by email code today.",
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
      createdLabel: relativeLabel(row.updatedAt),
      current: row.id === session.session.id,
      device: deviceFromUserAgent(row.userAgent),
      id: requiredPublicId(row.publicId, "sid", "Session"),
      location: row.ipAddress?.trim() || "Unknown location",
    })),
    twoFactorEnabled: user?.twoFactorEnabled ?? false,
  };
}

/**
 * Preferences live in browser cookies until User has columns; invalid values use defaults.
 */
export async function getPreferences(): Promise<UserPreferences> {
  const store = await cookies();
  return parsePreferences({
    dateFormat: store.get(PREFERENCE_COOKIES.dateFormat)?.value,
    density: store.get(PREFERENCE_COOKIES.density)?.value,
    landing: store.get(PREFERENCE_COOKIES.landing)?.value,
    theme: store.get(PREFERENCE_COOKIES.theme)?.value,
  });
}
