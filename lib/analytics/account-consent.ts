import "server-only";

import {
  CONSENT_VERSION,
  type ConsentState,
  parseConsentCookie,
  pendingConsent,
  serializeConsentCookie,
} from "@/lib/analytics/consent";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

type ConsentCredential = {
  authKind: "session" | "personal_token" | "oauth";
  credentialId?: string;
};

async function auditConsent(
  tx: Prisma.TransactionClient,
  userId: string,
  analytics: boolean,
  source: string,
  previous: boolean | null,
  credential: ConsentCredential,
) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { publicId: true },
  });
  await writeAudit(
    {
      action: "account.analytics_consent_updated",
      actorId: userId,
      targetId: user.publicId,
      targetType: "user",
      before: { analytics: previous },
      after: { analytics, source, version: CONSENT_VERSION, ...credential },
    },
    tx,
  );
}

export type AccountAnalyticsConsent = {
  analytics: boolean;
  decided_at: string | null;
  source: "web" | "ios" | "api" | null;
  version: number;
};

export async function readAccountAnalyticsConsent(
  userId: string,
): Promise<AccountAnalyticsConsent> {
  const row = await prisma.userAnalyticsConsent.findUnique({ where: { userId } });
  const result: AccountAnalyticsConsent = row
    ? {
        analytics: row.analytics,
        decided_at: row.decidedAt.toISOString(),
        source: row.source,
        version: row.version,
      }
    : { analytics: false, decided_at: null, source: null, version: CONSENT_VERSION };
  return accountConsentState(result).status === "decided"
    ? result
    : { analytics: false, decided_at: null, source: null, version: CONSENT_VERSION };
}

export async function saveAccountAnalyticsConsent(
  userId: string,
  analytics: boolean,
  source: "web" | "ios" | "api",
  decidedAt = new Date(),
  credential: ConsentCredential = { authKind: source === "web" ? "session" : "personal_token" },
  renew = false,
): Promise<AccountAnalyticsConsent> {
  const row = await prisma.$transaction(async (tx) => {
    // Serialize opposite decisions from concurrent devices before the idempotency check.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`analytics-consent:${userId}`}, 0))`;
    const existing = await tx.userAnalyticsConsent.findUnique({ where: { userId } });
    if (
      !renew &&
      existing &&
      existing.analytics === analytics &&
      existing.version === CONSENT_VERSION &&
      accountConsentState({ ...existing, decided_at: existing.decidedAt.toISOString() }).status ===
        "decided"
    )
      return existing;
    const saved = await tx.userAnalyticsConsent.upsert({
      where: { userId },
      create: { userId, analytics, source, decidedAt, version: CONSENT_VERSION },
      update: { analytics, source, decidedAt, version: CONSENT_VERSION },
    });
    await auditConsent(tx, userId, analytics, source, existing?.analytics ?? null, credential);
    return saved;
  });
  return {
    analytics: row.analytics,
    decided_at: row.decidedAt.toISOString(),
    source: row.source,
    version: row.version,
  };
}

export async function seedAccountAnalyticsConsent(userId: string, consent: ConsentState) {
  if (consent.status !== "decided" || consent.decidedAt === null || consent.analyticsNeedsDecision)
    return readAccountAnalyticsConsent(userId);
  const decidedAt = new Date(consent.decidedAt * 1000);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`analytics-consent:${userId}`}, 0))`;
    const existing = await tx.userAnalyticsConsent.findUnique({ where: { userId } });
    if (existing) return existing;
    const created = await tx.userAnalyticsConsent.create({
      data: {
        userId,
        analytics: consent.analytics,
        source: "web",
        decidedAt,
        version: CONSENT_VERSION,
      },
    });
    await auditConsent(tx, userId, created.analytics, "web", null, { authKind: "session" });
    return created;
  });
  return {
    analytics: row.analytics,
    decided_at: row.decidedAt.toISOString(),
    source: row.source,
    version: row.version,
  };
}

export function accountConsentState(consent: AccountAnalyticsConsent): ConsentState {
  if (!consent.decided_at || consent.version !== CONSENT_VERSION) return pendingConsent();
  return parseConsentCookie(
    serializeConsentCookie({
      analytics: consent.analytics,
      decidedAt: Math.floor(Date.parse(consent.decided_at) / 1000),
      replay: false,
      status: "decided",
    }),
  );
}
