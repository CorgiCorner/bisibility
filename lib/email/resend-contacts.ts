import type { WaitlistSource } from "@/lib/landing/waitlist-schema";

const RESEND_CONTACTS_ENDPOINT = "https://api.resend.com/contacts";

const segmentEnvBySource: Record<WaitlistSource, string> = {
  changelog: "RESEND_SEGMENT_GENERAL",
  cloud_pricing: "RESEND_SEGMENT_CLOUD",
  cloud_waitlist: "RESEND_SEGMENT_CLOUD",
  featured_company: "RESEND_SEGMENT_EARLY_ADOPTERS",
  landing_capture: "RESEND_SEGMENT_GENERAL",
  settings_feedback: "RESEND_SEGMENT_CLOUD",
  settings_notify: "RESEND_SEGMENT_CLOUD",
};

type WaitlistContact = {
  cloudPrice: string | null;
  email: string;
  source: WaitlistSource;
};

export function resolveWaitlistSegmentId(source: WaitlistSource) {
  return process.env[segmentEnvBySource[source]]?.trim() || null;
}

export async function syncWaitlistContact(input: WaitlistContact) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info("[waitlist] contact sync skipped because RESEND_API_KEY is not configured.");
    return;
  }

  const segmentId = resolveWaitlistSegmentId(input.source);

  try {
    const response = await fetch(RESEND_CONTACTS_ENDPOINT, {
      body: JSON.stringify({
        email: input.email,
        properties: {
          source: input.source,
          ...(input.cloudPrice ? { cloud_price: input.cloudPrice } : {}),
        },
        segments: segmentId ? [{ id: segmentId }] : undefined,
        unsubscribed: false,
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      console.warn(`[waitlist] contact sync failed with status ${response.status}.`);
    }
  } catch (error) {
    console.warn("[waitlist] contact sync failed.", error);
  }
}
