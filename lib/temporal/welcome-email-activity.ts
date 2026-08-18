import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveFounderEmailIdentity } from "@/lib/email/founder-email-identity";
import { createMarketingUnsubscribeToken } from "@/lib/email/marketing-unsubscribe";
import {
  prepareWelcomeEmail,
  sendPreparedWelcomeEmail,
  sendWelcomeFollowupEmail,
} from "@/lib/email/welcome-delivery";
import { NotificationType } from "@/lib/generated/prisma/client";
import { createNotification } from "@/lib/notifications/create";
import { absoluteUrl, resolveCanonicalOrigin } from "@/lib/seo/origin";

const OAUTH_PROVIDERS = new Set(["github", "google"]);

export async function sendWelcomeEmailActivity({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    select: {
      accounts: { select: { providerId: true } },
      deactivatedAt: true,
      email: true,
      name: true,
      _count: { select: { memberships: true, projects: true } },
      projects: {
        where: { onboardingCompletedAt: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
    where: { id: userId },
  });

  if (!user) return { status: "missing" as const };
  if (user.deactivatedAt) return { status: "deactivated" as const };
  if (user._count.memberships > 0 && user._count.projects === 0) {
    return { status: "invited_member" as const };
  }

  const origin = resolveCanonicalOrigin();
  const variant = user.projects.length > 0 ? "completed" : "incomplete";
  const prepared = prepareWelcomeEmail(
    {
      email: user.email,
      name: user.name,
      profileNameTrusted: user.accounts.some(({ providerId }) => OAUTH_PROVIDERS.has(providerId)),
      variant,
    },
    origin,
  );

  const body =
    variant === "completed"
      ? "Your first check is a baseline. Let it run for a week or two while history builds."
      : "Setup did not get all the way through, but nothing is lost. Pick it up in bisibility Cloud.";

  const claim = await createNotification(
    userId,
    null,
    NotificationType.system,
    "Welcome to bisibility Cloud",
    body,
    { variant },
    "welcome_email",
  );

  if (!claim) return { status: "already_sent" as const };

  try {
    await sendPreparedWelcomeEmail(prepared);
  } catch (error) {
    // Release permits retry, but a transport failure after provider acceptance can still make delivery ambiguous.
    try {
      await prisma.notification.delete({ where: { id: claim.id } });
    } catch {
      console.error("welcome email: failed to release delivery claim");
    }
    throw error;
  }

  return { status: "sent" as const };
}

export async function sendWelcomeFollowupActivity({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    select: {
      accounts: { select: { providerId: true } },
      deactivatedAt: true,
      email: true,
      name: true,
      marketingEmailUnsubscribedAt: true,
      _count: { select: { memberships: true, projects: true } },
    },
    where: { id: userId },
  });

  if (!user) return { status: "missing" as const };
  if (user.deactivatedAt) return { status: "deactivated" as const };
  if (user._count.memberships > 0 && user._count.projects === 0) {
    return { status: "invited_member" as const };
  }
  if (user.marketingEmailUnsubscribedAt) return { status: "unsubscribed" as const };

  const token = createMarketingUnsubscribeToken(userId);
  const origin = resolveCanonicalOrigin();
  const unsubscribeUrl = absoluteUrl(
    origin,
    `/email/unsubscribe?token=${encodeURIComponent(token)}`,
  );
  const identity = resolveFounderEmailIdentity();
  const founderName = identity.founderName ?? "the bisibility team";
  const title = `A note from ${founderName}`;
  const body = "Quick question: what made you sign up, and what were you using before?";

  const claim = await createNotification(
    userId,
    null,
    NotificationType.system,
    title,
    body,
    undefined,
    "founder_checkin_email",
  );

  if (!claim) return { status: "already_sent" as const };

  try {
    await sendWelcomeFollowupEmail({
      email: user.email,
      name: user.name,
      profileNameTrusted: user.accounts.some(({ providerId }) => OAUTH_PROVIDERS.has(providerId)),
      unsubscribeUrl,
    });
  } catch (error) {
    // Release permits retry, but a transport failure after provider acceptance can still make delivery ambiguous.
    try {
      await prisma.notification.delete({ where: { id: claim.id } });
    } catch {
      console.error("welcome follow-up: failed to release delivery claim");
    }
    throw error;
  }

  return { status: "sent" as const };
}
