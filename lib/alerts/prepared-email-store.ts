import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  PreparedEmailRecord,
  PreparedEmailState,
  PreparedEmailStore,
} from "./prepared-email-delivery";

type PreparedRow = {
  budgetReserved: boolean;
  deliveryIdentity: string;
  deliveryInputs: string | null;
  fromAddress: string;
  headers: Prisma.JsonValue;
  html: string;
  idempotencyKey: string;
  idempotent: boolean;
  listUnsubscribeUrl: string;
  providerCode: string | null;
  providerId: string | null;
  state: string;
  subject: string;
  text: string;
  toAddress: string;
};

function headersOf(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Prepared email headers are missing.");
  }
  const headers: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") throw new Error("Prepared email headers are missing.");
    headers[key] = entry;
  }
  return headers;
}

function fromRow(row: PreparedRow): PreparedEmailRecord {
  return {
    budgetReserved: row.budgetReserved,
    deliveryIdentity: row.deliveryIdentity,
    deliveryInputs: row.deliveryInputs,
    from: row.fromAddress,
    headers: headersOf(row.headers),
    html: row.html,
    idempotencyKey: row.idempotencyKey,
    idempotent: row.idempotent,
    listUnsubscribeUrl: row.listUnsubscribeUrl,
    providerCode: row.providerCode,
    providerId: row.providerId,
    state: row.state as PreparedEmailState,
    subject: row.subject,
    text: row.text,
    to: row.toAddress,
  };
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const prismaPreparedEmailStore: PreparedEmailStore = {
  async claimBudget(identity) {
    const claimed = await prisma.preparedEmailMessage.updateMany({
      data: { budgetReserved: true },
      where: { budgetReserved: false, deliveryIdentity: identity },
    });
    return claimed.count === 1;
  },
  async compareAndSet(identity, from, patch) {
    if (patch.idempotencyKey && patch.idempotencyKey !== undefined) {
      const current = await prisma.preparedEmailMessage.findUnique({
        select: { idempotencyKey: true },
        where: { deliveryIdentity: identity },
      });
      if (current && current.idempotencyKey !== patch.idempotencyKey) return false;
    }
    const updated = await prisma.preparedEmailMessage.updateMany({
      data: {
        ...(patch.idempotent === undefined ? {} : { idempotent: patch.idempotent }),
        ...(patch.providerCode === undefined ? {} : { providerCode: patch.providerCode }),
        ...(patch.providerId === undefined ? {} : { providerId: patch.providerId }),
        ...(patch.state === undefined ? {} : { state: patch.state }),
        ...(patch.to === undefined ? {} : { toAddress: patch.to }),
      },
      where: { deliveryIdentity: identity, state: from },
    });
    return updated.count === 1;
  },
  async find(identity) {
    const row = await prisma.preparedEmailMessage.findUnique({
      where: { deliveryIdentity: identity },
    });
    return row ? fromRow(row) : null;
  },
  async insert(record) {
    try {
      const row = await prisma.preparedEmailMessage.create({
        data: {
          budgetReserved: record.budgetReserved,
          deliveryIdentity: record.deliveryIdentity,
          deliveryInputs: record.deliveryInputs,
          fromAddress: record.from,
          headers: record.headers,
          html: record.html,
          idempotencyKey: record.idempotencyKey,
          idempotent: record.idempotent,
          listUnsubscribeUrl: record.listUnsubscribeUrl,
          providerCode: record.providerCode,
          providerId: record.providerId,
          state: record.state,
          subject: record.subject,
          text: record.text,
          toAddress: record.to,
        },
      });
      return fromRow(row);
    } catch (error) {
      if (isUnique(error)) return "conflict";
      throw error;
    }
  },
  async releaseUnconsumedBudgetClaim(identity) {
    await prisma.preparedEmailMessage.updateMany({
      data: { budgetReserved: false },
      where: { deliveryIdentity: identity, state: "prepared" },
    });
  },
};
