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
import { revalidatePath } from "next/cache";

type StoredWaitlist = {
  cloudPrice: string | null;
  email: string;
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

function inputFromFormData(input: unknown) {
  if (!(input instanceof FormData)) {
    return input;
  }

  return Object.fromEntries(input.entries());
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
  const details = [
    `Email: ${input.email}`,
    `Source: ${input.source}`,
    input.cloudPrice ? `Cloud price: ${input.cloudPrice}` : null,
    `Submissions: ${input.submissions}`,
  ].filter(Boolean);

  if (!isEmailConfigured() || !to) {
    console.info(`[waitlist] ${details.join(" | ")}`);
    return;
  }

  const text = details.join("\n");
  await sendEmail({
    category: "transactional",
    html: `<p>New Bisibility waitlist submission.</p><pre>${escapeHtml(text)}</pre>`,
    subject: `Bisibility waitlist: ${input.email}`,
    text,
    to,
  });
}

export async function joinWaitlist(input: unknown) {
  const parsed = waitlistSchema.parse(inputFromFormData(input));
  const email = normalizeEmail(parsed.email);
  const cloudPrice = cloudPriceLabel(parsed);
  const lastSubmittedAt = new Date();
  const persisted = await prisma.waitlist.upsert({
    create: {
      cloudPrice,
      email,
      lastSubmittedAt,
      source: parsed.source,
    },
    select: { cloudPrice: true, email: true, source: true, submissions: true },
    update: {
      cloudPrice: cloudPrice ?? undefined,
      lastSubmittedAt,
      source: parsed.source,
      submissions: { increment: 1 },
    },
    where: { email },
  });
  const stored: StoredWaitlist = { ...persisted, source: parsed.source };

  await syncWaitlistContact(stored);
  if (parsed.source !== "cloud_waitlist") {
    await notifyOwner(stored);
  }
  revalidatePath("/");

  return { email, ok: true };
}
