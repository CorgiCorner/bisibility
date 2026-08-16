import { prisma } from "@/lib/db/prisma";

export function normalizeWaitlistEmail(email: string) {
  return email.trim().toLowerCase();
}

// Plain server-side query. This is NOT a "use server" module: exporting the
// answered-state lookup from a "use server" module would turn it into a
// callable, unauthenticated email-existence oracle. This module is server-only
// and not invocable as a server action, so callers (pages/actions) that have
// already authorized the session can read the row without exposing the
// lookup to arbitrary callers.
export async function getPricingFeedbackRow(email: string) {
  return prisma.waitlist.findUnique({
    select: { hostedPriceAnsweredAt: true, source: true },
    where: { email: normalizeWaitlistEmail(email) },
  });
}
