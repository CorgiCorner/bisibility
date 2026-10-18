import "server-only";

import {
  type ClientAttribution,
  clientAttributionSchema,
} from "@/lib/analytics/client-attribution";
import {
  CONSENT_COOKIE,
  type ConsentState,
  parseConsentCookie,
  pendingConsent,
} from "@/lib/analytics/consent";
import { validateEventProps } from "@/lib/analytics/event-schemas";
import { resolveAnalyticsProvider } from "@/lib/analytics/provider";
import { resolveServerAnalyticsUser } from "@/lib/analytics/server-user";

async function captureServerEvent(_input: unknown): Promise<void> {}

import { cookies, headers } from "next/headers";

export interface ServerAnalyticsEventRegistry {
  consent_updated: true;
  keywords_added: true;
  onboarding_completed: true;
  onboarding_project_created: true;
  provider_connected: true;
  provider_connection_tested: true;
  rank_check_preview_completed: true;
  user_signed_up: true;
}

export type ServerAnalyticsEvent = keyof ServerAnalyticsEventRegistry;
export type ServerAnalyticsSurface = "getting_started" | "onboarding" | "settings";

type TrackServerEventOptions = {
  attribution?: ClientAttribution;
  consent: ConsentState;
  distinctId?: string;
  userId?: string;
  properties?: Record<string, unknown>;
  timestamp?: Date;
  uuid?: string;
  projectId?: string;
  processPersonProfile?: boolean;
};

export async function readConsentFromCookies(): Promise<ConsentState> {
  try {
    const store = await cookies();
    return parseConsentCookie(store.get(CONSENT_COOKIE)?.value);
  } catch {
    return pendingConsent();
  }
}

export async function readAnalyticsSurfaceFromHeaders(): Promise<ServerAnalyticsSurface | null> {
  try {
    const store = await headers();
    const requestUrl = store.get("next-url") ?? store.get("referer");
    if (!requestUrl) return null;
    const pathname = requestUrl.startsWith("/") ? requestUrl : new URL(requestUrl).pathname;
    if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) return "onboarding";
    if (pathname.includes("/getting-started")) return "getting_started";
    if (pathname.includes("/settings")) return "settings";
    return null;
  } catch {
    return null;
  }
}

export async function trackServerEvent(
  event: ServerAnalyticsEvent,
  {
    consent,
    distinctId,
    userId,
    properties = {},
    timestamp,
    uuid,
    attribution,
    projectId,
    processPersonProfile,
  }: TrackServerEventOptions,
): Promise<void> {
  const provider = resolveAnalyticsProvider(process.env);
  if (provider !== "posthog") return;
  if (userId) {
    try {
      const resolved = await resolveServerAnalyticsUser(userId, consent);
      if (!resolved) return;
      distinctId = resolved.distinctId;
      consent = resolved.consent;
    } catch {
      return;
    }
  }
  if (event !== "consent_updated" && !consent.analytics) return;
  if (event !== "consent_updated" && !distinctId) return;

  try {
    const validated = validateEventProps(event, properties);
    const client = clientAttributionSchema.parse(
      attribution ?? { client: "web", auth_kind: "session" },
    );
    await captureServerEvent({
      distinctId,
      event,
      properties: {
        ...validated,
        ...client,
        ...(processPersonProfile === false ? { $process_person_profile: false } : {}),
      },
      ...(projectId ? { groups: { project: projectId } } : {}),
      ...(timestamp ? { timestamp } : {}),
      ...(uuid ? { uuid } : {}),
    });
  } catch {
    // Analytics delivery is best effort and must not fail the product mutation it follows.
  }
}
