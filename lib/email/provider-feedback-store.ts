import "server-only";

import { prisma } from "@/lib/db/prisma";
import { EmailSuppressedError } from "./types";

function normalizeRecipient(value: string) {
  return value.trim().toLowerCase();
}

export async function isMailSuppressed(recipient: string) {
  return Boolean(
    await prisma.mailSuppression.findUnique({
      where: { recipient: normalizeRecipient(recipient) },
      select: { recipient: true },
    }),
  );
}

export async function assertMailNotSuppressed(recipient: string) {
  if (await isMailSuppressed(recipient)) throw new EmailSuppressedError();
}

export async function recordMailReceipt(input: {
  provider: string;
  messageId: string;
  recipient: string;
}) {
  await prisma.mailProviderReceipt.create({
    data: { ...input, recipient: normalizeRecipient(input.recipient) },
  });
}

/** The event and any suppression commit together. A missing receipt can be retried. */
export async function applyMailProviderFeedback(input: {
  eventId: string;
  provider: string;
  messageId: string;
  kind: "bounce" | "complaint" | "transient";
  recipients: string[];
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.mailFeedbackEvent.findUnique({ where: { id: input.eventId } });
    if (existing) return "duplicate" as const;
    const receipt = await tx.mailProviderReceipt.findUnique({
      where: { provider_messageId: { provider: input.provider, messageId: input.messageId } },
    });
    if (!receipt) return "missing_receipt" as const;
    const inserted = await tx.mailFeedbackEvent.createMany({
      data: [{ id: input.eventId, kind: input.kind }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return "duplicate" as const;
    if (
      input.kind !== "transient" &&
      input.recipients.some((recipient) => normalizeRecipient(recipient) === receipt.recipient)
    ) {
      await tx.mailSuppression.upsert({
        where: { recipient: receipt.recipient },
        create: { recipient: receipt.recipient, reason: input.kind },
        update: {},
      });
    }
    return "processed" as const;
  });
}

export async function wasMailFeedbackProcessed(eventId: string) {
  return Boolean(
    await prisma.mailFeedbackEvent.findUnique({ where: { id: eventId }, select: { id: true } }),
  );
}

export async function recordMailFeedbackEvent(eventId: string, kind: string) {
  await prisma.mailFeedbackEvent.createMany({
    data: [{ id: eventId, kind }],
    skipDuplicates: true,
  });
}
