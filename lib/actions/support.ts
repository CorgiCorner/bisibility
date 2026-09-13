"use server";

import { appExtensions } from "@/lib/app-extensions";
import { requireSession } from "@/lib/auth/session";
import type { SupportWidgetPayload } from "@/lib/support/widget-contract";

/** Refreshes support credentials only for the currently authenticated account. */
export async function refreshSupportWidget(): Promise<SupportWidgetPayload | null> {
  const session = await requireSession();

  return appExtensions.getSupportWidgetPayload({
    expiresAt: session.session.expiresAt,
    userId: session.user.id,
  });
}
