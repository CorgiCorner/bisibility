import { z } from "zod";

const ACCEPTED_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 * 6;
const REFUSED_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const CONSENT_COOKIE = "bv_consent";
export const CONSENT_VERSION = 2;

export type ConsentState = {
  analytics: boolean;
  decidedAt: number | null;
  replay: boolean;
  replayNeedsDecision?: boolean;
  status: "decided" | "pending";
};

export const analyticsConsentValuesSchema = z.object({
  analytics: z.boolean(),
  replay: z.boolean(),
});

export type AnalyticsConsentValues = z.infer<typeof analyticsConsentValuesSchema>;

export const consentPromptContextSchema = z.object({
  variant: z.enum(["immediate", "delayed_5s", "replay_update"]),
  source: z.enum(["banner", "banner_settings"]),
  decision_ms: z.number().int().min(0).max(86_400_000),
});
export type ConsentPromptContext = z.infer<typeof consentPromptContextSchema>;

export const pendingConsent = (): ConsentState => ({
  analytics: false,
  decidedAt: null,
  replay: false,
  status: "pending",
});

export function parseConsentCookie(value: string | null | undefined): ConsentState {
  if (!value) return pendingConsent();
  const match = /^v(?<version>\d+)\.a(?<analytics>[01])\.r(?<replay>[01])\.t(?<time>\d+)$/.exec(
    value,
  );
  if (!match?.groups || ![1, CONSENT_VERSION].includes(Number(match.groups.version))) {
    return pendingConsent();
  }

  const decidedAt = Number(match.groups.time);
  const analytics = match.groups.analytics === "1";
  const replay = match.groups.replay === "1";
  if (
    !Number.isSafeInteger(decidedAt) ||
    decidedAt <= 0 ||
    (Number(match.groups.version) === 1 && replay && !analytics)
  ) {
    return pendingConsent();
  }

  const lifetime =
    analytics || replay ? ACCEPTED_CONSENT_MAX_AGE_SECONDS : REFUSED_CONSENT_MAX_AGE_SECONDS;
  if (Date.now() / 1000 - decidedAt >= lifetime) return pendingConsent();

  if (Number(match.groups.version) === 1 && replay) {
    return { analytics, decidedAt, replay: false, replayNeedsDecision: true, status: "decided" };
  }
  return { analytics, decidedAt, replay, status: "decided" };
}

export function serializeConsentCookie(state: ConsentState): string {
  if (state.status !== "decided" || state.decidedAt === null) {
    throw new Error("Only a valid decided consent state can be serialized.");
  }
  return `v${CONSENT_VERSION}.a${state.analytics ? 1 : 0}.r${state.replay ? 1 : 0}.t${state.decidedAt}`;
}

export function consentCookieOptions(environment = process.env.NODE_ENV, consent?: ConsentState) {
  return {
    httpOnly: false,
    maxAge:
      consent?.status === "decided" && (consent.analytics || consent.replay)
        ? ACCEPTED_CONSENT_MAX_AGE_SECONDS
        : REFUSED_CONSENT_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: environment === "production",
  };
}
