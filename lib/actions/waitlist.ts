"use server";

import { prisma } from "@/lib/db/prisma";
import { configuredEmailFrom } from "@/lib/email/from";
import { isEmailConfigured } from "@/lib/email/registry";
import { syncWaitlistContact } from "@/lib/email/resend-contacts";
import { sendEmail } from "@/lib/email/send";
import {
  type WaitlistFormValues,
  type WaitlistSource,
  waitlistSchema,
} from "@/lib/landing/waitlist-schema";
import { normalizeWaitlistEmail } from "@/lib/queries/waitlist";
import { revalidatePath } from "next/cache";

type StoredWaitlist = {
  cloudPrice: string | null;
  email: string;
  hostedPrice: string | null;
  source: WaitlistSource;
  submissions: number;
};

const htmlEscapes: Record<string, string> = {
  '"': "&quot;",
  "&": "&amp;",
  "'": "&#39;",
  "<": "&lt;",
  ">": "&gt;",
};

const settingsFeedbackSources = new Set<WaitlistSource>(["settings_feedback"]);

function inputFromFormData(input: unknown) {
  if (!(input instanceof FormData)) {
    return input;
  }

  return Object.fromEntries(input.entries());
}

const priceCarryingSources = new Set<WaitlistSource>([
  "cloud_pricing",
  "settings_feedback",
  "settings_notify",
]);

function cloudPriceLabel(input: WaitlistFormValues) {
  if (!priceCarryingSources.has(input.source) || !input.cloudPrice) {
    return null;
  }

  return input.cloudPrice === "custom"
    ? `$${input.cloudPriceCustom}/mo`
    : `$${input.cloudPrice}/mo`;
}

function resolveNotifyEmail() {
  const explicit = process.env.WAITLIST_NOTIFY_EMAIL?.trim();
  if (explicit) {
    return explicit;
  }

  const configuredFrom = configuredEmailFrom();
  const fromMatch = configuredFrom ? /<([^<>]+)>/.exec(configuredFrom) : null;
  const candidate = fromMatch?.[1] ?? configuredFrom;
  return candidate?.includes("@") ? candidate.trim() : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);
}

async function notifyOwner(input: StoredWaitlist) {
  const to = resolveNotifyEmail();
  const isFeedback = settingsFeedbackSources.has(input.source);
  // Settings feedback shows only the dedicated hostedPrice as the current
  // feedback price; the preserved cloudPrice from a different incoming
  // source is not a current feedback answer and is omitted here. Non-feedback
  // notifications keep their existing cloud-price detail.
  const details = [
    `Email: ${input.email}`,
    `Source: ${input.source}`,
    input.cloudPrice && !isFeedback ? `Hosted price: ${input.cloudPrice}` : null,
    input.hostedPrice && isFeedback ? `Feedback price: ${input.hostedPrice}` : null,
    `Submissions: ${input.submissions}`,
  ].filter(Boolean);

  if (!isEmailConfigured() || !to) {
    console.info(`[waitlist] ${details.join(" | ")}`);
    return;
  }

  const text = details.join("\n");
  const subject = isFeedback
    ? `bisibility pricing feedback: ${input.email}`
    : `bisibility waitlist: ${input.email}`;
  const intro = isFeedback
    ? "New pricing feedback from settings."
    : "New bisibility waitlist submission.";
  await sendEmail({
    category: "transactional",
    html: `<p>${intro}</p><pre>${escapeHtml(text)}</pre>`,
    subject,
    text,
    to,
  });
}

export async function joinWaitlist(input: unknown) {
  const parsed = waitlistSchema.parse(inputFromFormData(input));
  const email = normalizeWaitlistEmail(parsed.email);
  const cloudPrice = cloudPriceLabel(parsed);
  const isFeedback = settingsFeedbackSources.has(parsed.source);
  const lastSubmittedAt = new Date();

  // submissions is a lifetime count incremented on every accepted upsert
  // across all sources and is not a per-source feedback counter; it is never
  // reset. See the matching comment on the Waitlist model in schema.prisma.
  //
  // R0.d: an existing row's source and cloudPrice are not overwritten when
  // the incoming submission is from a different source. Look up the existing
  // row's source to detect cross-source transitions; a same-source
  // resubmission may still refresh its own price. Settings feedback always
  // preserves source and cloudPrice and only moves the hosted fields.
  const existing = await prisma.waitlist.findUnique({
    select: { source: true },
    where: { email },
  });
  const isCrossSource = existing !== null && existing.source !== parsed.source;

  const persisted = await prisma.waitlist.upsert({
    create: {
      cloudPrice: isFeedback ? null : cloudPrice,
      email,
      hostedPrice: isFeedback ? cloudPrice : null,
      hostedPriceAnsweredAt: isFeedback ? lastSubmittedAt : null,
      lastSubmittedAt,
      source: parsed.source,
    },
    select: {
      cloudPrice: true,
      email: true,
      hostedPrice: true,
      source: true,
      submissions: true,
    },
    update: isFeedback
      ? {
          // Settings feedback preserves the original source and cloudPrice from
          // a different incoming source; only the feedback-specific columns move.
          hostedPrice: cloudPrice ?? undefined,
          hostedPriceAnsweredAt: lastSubmittedAt,
          lastSubmittedAt,
          submissions: { increment: 1 },
        }
      : isCrossSource
        ? {
            // Different non-feedback source: preserve the existing row's
            // source and cloudPrice; only the bookkeeping columns move.
            lastSubmittedAt,
            submissions: { increment: 1 },
          }
        : {
            cloudPrice: cloudPrice ?? undefined,
            lastSubmittedAt,
            source: parsed.source,
            submissions: { increment: 1 },
          },
    where: { email },
  });
  // Downstream notification/contact payloads describe this submission, not
  // preserved values from a row owned by a different source.
  const submission: StoredWaitlist = {
    ...persisted,
    cloudPrice: isFeedback ? persisted.cloudPrice : cloudPrice,
    hostedPrice: isFeedback ? cloudPrice : persisted.hostedPrice,
    source: parsed.source,
  };

  // Settings feedback skips marketing contact sync; it is a product-internal
  // answer, not a landing-page or cloud-pricing signup that belongs in Resend.
  if (!isFeedback) {
    await syncWaitlistContact(submission);
  }

  if (parsed.source !== "cloud_waitlist") {
    await notifyOwner(submission);
  }
  revalidatePath("/");

  return { email, ok: true };
}
