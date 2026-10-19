import "server-only";

import { accountConsentState, readAccountAnalyticsConsent } from "@/lib/analytics/account-consent";
import { type ClientAttribution, parseClientAttribution } from "@/lib/analytics/client-attribution";
import { type ServerAnalyticsEvent, trackServerEvent } from "@/lib/analytics/server";
import { prisma } from "@/lib/db/prisma";

export type ApiAnalyticsIdentity = {
  userId: string;
  projectId: string;
  attribution: ClientAttribution;
};

export function apiAnalyticsIdentity(
  input: { userId: string; projectId: string; authKind: ClientAttribution["auth_kind"] },
  headers: Headers,
): ApiAnalyticsIdentity {
  return { ...input, attribution: parseClientAttribution(headers, input.authKind) };
}

export async function trackApiEvent(
  identity: ApiAnalyticsIdentity | undefined,
  event: ServerAnalyticsEvent,
  properties: Record<string, unknown>,
): Promise<void> {
  if (!identity) return;
  try {
    const consent = accountConsentState(await readAccountAnalyticsConsent(identity.userId));
    if (!consent.analytics) return;
    const user = await prisma.user.findUnique({
      where: { id: identity.userId },
      select: { publicId: true, deactivatedAt: true },
    });
    if (!user || user.deactivatedAt) return;
    const isProjectKey = identity.attribution.auth_kind === "project_key";
    await trackServerEvent(event, {
      consent,
      distinctId: isProjectKey ? `project:${identity.projectId}` : user.publicId,
      properties,
      attribution: identity.attribution,
      projectId: identity.projectId,
      processPersonProfile: !isProjectKey,
    });
  } catch {
    // Consent lookup and delivery failures cannot change the committed product result.
  }
}
