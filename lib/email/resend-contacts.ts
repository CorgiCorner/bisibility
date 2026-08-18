import type { WaitlistSource } from "@/lib/landing/waitlist-schema";

const RESEND_CONTACTS_ENDPOINT = "https://api.resend.com/contacts";

type WaitlistContact = {
  cloudPrice: string | null;
  email: string;
  source: WaitlistSource;
};

export function resolveWaitlistSegmentId(source: WaitlistSource) {
  switch (source) {
    case "changelog":
    case "landing_capture":
      return process.env.RESEND_SEGMENT_GENERAL?.trim() || null;
    case "featured_company":
      return process.env.RESEND_SEGMENT_EARLY_ADOPTERS?.trim() || null;
    case "cloud_waitlist":
    case "cloud_pricing":
    case "settings_notify":
    case "settings_feedback":
      return process.env.RESEND_SEGMENT_CLOUD?.trim() || null;
    default: {
      const exhaustive: never = source;
      throw new Error(`Unsupported waitlist source: ${exhaustive}`);
    }
  }
}

export async function syncWaitlistContact(input: WaitlistContact) {
  const apiKey = process.env.RESEND_CONTACTS_API_KEY;
  if (!apiKey) {
    console.info(
      "[waitlist] contact sync skipped because RESEND_CONTACTS_API_KEY is not configured.",
    );
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
