"use server";

import { prisma } from "@/lib/db/prisma";
import { configuredEmailFrom } from "@/lib/email/from";
import { isEmailConfigured } from "@/lib/email/registry";
import { sendEmail } from "@/lib/email/send";
import {
  enforceDistinctNewEmailLimit,
  enforceHumanVerification,
  enforceWaitlistRateLimits,
  hashIdentifier,
  resolveClientIdentity,
} from "@/lib/landing/waitlist-protection";
import { type WaitlistActionResult, waitlistFailureResult } from "@/lib/landing/waitlist-result";
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

// Checkbox semantics: an absent field means unchecked and persists false
// (latest opinion wins). This differs from cloudPrice on purpose: for a
// select, absence means unanswered and the stored value is kept.
function usagePricingPreference(input: WaitlistFormValues) {
  return input.source === "cloud_pricing" ? (input.prefersUsagePricing ?? false) : null;
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

async function runWaitlistProtection(check: () => Promise<void>) {
  try {
    await check();
    return null;
  } catch (error) {
    const failure = waitlistFailureResult(error);
    if (failure) {
      return failure;
    }
    throw error;
  }
}

export async function joinWaitlist(input: unknown): Promise<WaitlistActionResult> {
  const parsed = waitlistSchema.parse(inputFromFormData(input));
  const email = normalizeWaitlistEmail(parsed.email);
  const cloudPrice = cloudPriceLabel(parsed);
  const prefersUsagePricing = usagePricingPreference(parsed);
  const isFeedback = settingsFeedbackSources.has(parsed.source);
  const lastSubmittedAt = new Date();

  const { clientDigest, rawIp } = await resolveClientIdentity();
  const emailDigest = hashIdentifier(email);
  const requestFailure = await runWaitlistProtection(async () => {
    await enforceHumanVerification(parsed.source, parsed.verificationToken, rawIp, clientDigest);
    await enforceWaitlistRateLimits(clientDigest, emailDigest);
  });
  if (requestFailure) {
    return requestFailure;
  }

  const existing = await prisma.waitlist.findUnique({
    select: { cloudPrice: true, prefersUsagePricing: true, source: true },
    where: { email },
  });

  if (!existing) {
    const distinctEmailFailure = await runWaitlistProtection(() =>
      enforceDistinctNewEmailLimit(clientDigest),
    );
    if (distinctEmailFailure) {
      return distinctEmailFailure;
    }
  }

  if (
    parsed.source === "cloud_pricing" &&
    existing &&
    cloudPrice === existing.cloudPrice &&
    prefersUsagePricing === existing.prefersUsagePricing
  ) {
    return { changed: false, email, ok: true };
  }

  const isCrossSource = existing !== null && existing.source !== parsed.source;

  const persisted = await prisma.waitlist.upsert({
    create: {
      cloudPrice: isFeedback ? null : cloudPrice,
      email,
      hostedPrice: isFeedback ? cloudPrice : null,
      hostedPriceAnsweredAt: isFeedback ? lastSubmittedAt : null,
      lastSubmittedAt,
      prefersUsagePricing: prefersUsagePricing ?? false,
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
        ? parsed.source === "cloud_pricing"
          ? {
              // Narrow exception to the cross-source rule above: a
              // cloud_pricing vote arriving on a
              // row owned by another source still records the price and the
              // usage-preference opinion. Unlike source, these two fields are
              // not first-contact attribution - they are an answer to one
              // question, and a beta user already on the waitlist is the most
              // informed opinion this page can collect. source is left
              // untouched; submissions and lastSubmittedAt move as usual.
              cloudPrice: cloudPrice ?? undefined,
              lastSubmittedAt,
              prefersUsagePricing: prefersUsagePricing ?? undefined,
              submissions: { increment: 1 },
            }
          : {
              // Different non-feedback source: preserve the existing row's
              // source and cloudPrice; only the bookkeeping columns move.
              lastSubmittedAt,
              submissions: { increment: 1 },
            }
        : {
            cloudPrice: cloudPrice ?? undefined,
            lastSubmittedAt,
            prefersUsagePricing: prefersUsagePricing ?? undefined,
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

  if (parsed.source !== "cloud_waitlist") {
    await notifyOwner(submission);
  }
  revalidatePath("/");

  return { changed: true, email, ok: true };
}
