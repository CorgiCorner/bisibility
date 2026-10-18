import "server-only";

import { CONSENT_ACCOUNT_COOKIE, type ConsentState } from "@/lib/analytics/consent";
import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import { accountConsentState } from "./account-consent";

export async function resolveServerAnalyticsUser(userId: string, consent: ConsentState) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicId: true, deactivatedAt: true, analyticsConsent: true },
    });
    if (!user || user.deactivatedAt) return null;
    const account = user.analyticsConsent;
    const current = account
      ? accountConsentState({ ...account, decided_at: account.decidedAt.toISOString() })
      : null;
    let analytics = current ? current.analytics : consent.analytics;
    let analyticsNeedsDecision = current?.status === "pending";
    if (!account && analytics) {
      const owner = (await cookies()).get(CONSENT_ACCOUNT_COOKIE)?.value;
      analytics = !owner || owner === user.publicId;
      analyticsNeedsDecision = !analytics;
    }
    return {
      distinctId: user.publicId,
      consent: {
        ...consent,
        ...(consent.status === "pending" && current?.status === "decided"
          ? { status: "decided" as const, decidedAt: current.decidedAt }
          : {}),
        analytics,
        ...(consent.analyticsNeedsDecision && current?.status === "decided"
          ? { analyticsNeedsDecision: false }
          : {}),
        ...(analyticsNeedsDecision ? { analyticsNeedsDecision: true } : {}),
      },
    };
  } catch {
    return null;
  }
}
