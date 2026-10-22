import "server-only";
import type { ActionPaymentQuote, ActionPaymentReceipt } from "@/lib/action-payment/contract";
import {
  readActionPaymentConsent,
  sealActionPaymentConsent,
} from "@/lib/action-payment/durable-consent";
import { actionPaymentOption } from "@/lib/action-payment/options";
import { notApplicablePaymentCache } from "@/lib/action-payment/quote-cache";
import { actionPaymentOptionSchema } from "@/lib/action-payment/schema";
import {
  ActionPaymentError,
  createPaymentToken,
  paymentFingerprint,
  readPaymentToken,
} from "@/lib/action-payment/token";
import { Prisma } from "@/lib/generated/prisma/client";
import type { NativeRequestGuard } from "@/lib/metering/paid-attempt-types";
import type { SerpProvider } from "@/lib/providers/types";
import { z } from "zod";

export const aiPaymentConsentSchema = z
  .object({
    version: z.literal(1),
    id: z.string(),
    projectId: z.string(),
    ownerId: z.string(),
    actorId: z.string().nullable(),
    source: z.string(),
    connectionId: z.string(),
    route: z.string(),
    request: z.string(),
    definition: z.string(),
    scope: z.enum(["manual", "recurring"]),
    option: actionPaymentOptionSchema,
    policy: z.literal("advisory"),
    executionId: z.string().optional(),
    recurringScheduleId: z.string().optional(),
  })
  .strict();
export type AiPaymentConsent = ReturnType<typeof sealActionPaymentConsent>;
export type AiPaymentSource = {
  project: { id: string; ownerId: string };
  connection: {
    id: string;
    publicId: string;
    provider: string;
    credentialSource: "own" | "hosted";
    credentialsEncrypted: string | null;
  };
  provider: SerpProvider;
};
export function aiOwnPaymentQuote(input: {
  source: AiPaymentSource;
  actorId?: string | null;
  entrySource: string;
  feature: string;
  definition: unknown;
  scope?: "manual" | "recurring";
  estimatedCostCents: number;
}) {
  if (input.source.connection.credentialSource !== "own")
    throw new ActionPaymentError("payment_unavailable");
  const option = actionPaymentOption(input.source, input.feature);
  if (option?.payableUnit.kind !== "currency" || option.payableUnit.code !== "USD")
    throw new ActionPaymentError("payment_unavailable");
  const definition = paymentFingerprint([
    input.feature,
    "advisory",
    input.scope ?? "manual",
    input.definition,
  ]);
  const request = paymentFingerprint([
    input.source.project.id,
    input.actorId ?? null,
    input.entrySource,
    definition,
  ]);
  const route = paymentFingerprint([
    input.source.project.id,
    input.source.project.ownerId,
    input.source.connection.id,
    "own",
    input.source.connection.credentialsEncrypted,
    option,
  ]);
  const signed = createPaymentToken({
    request,
    route,
    scope: paymentFingerprint([input.source.project.id, input.actorId ?? null]),
    source: input.entrySource,
    option,
    children: {
      operation: {
        free: false,
        authority: "advisory",
        amount: new Prisma.Decimal(input.estimatedCostCents).div(100).toFixed(),
        providerCostCents: String(input.estimatedCostCents),
        nativeQuantity: null,
      },
    },
  });
  const quote: ActionPaymentQuote = {
    id: signed.payload.id,
    quoteToken: signed.token,
    expiresAt: new Date(signed.payload.exp * 1000).toISOString(),
    option,
    charge: {
      value: signed.payload.children.operation.amount,
      unit: option.payableUnit,
      certainty: "estimate",
    },
    cache: notApplicablePaymentCache(),
    availability: { allowed: true, reason: null },
  };
  return {
    payment: quote,
    paymentOptions: [option],
    accept(accepted?: { quoteToken: string }, required = false) {
      if (!accepted) {
        if (required) throw new ActionPaymentError("payment_quote_required");
        return undefined;
      }
      const original = readPaymentToken(accepted.quoteToken);
      if (original.request !== request || original.route !== route)
        throw new ActionPaymentError("payment_quote_changed");
      return sealActionPaymentConsent({
        version: 1,
        id: original.id,
        projectId: input.source.project.id,
        ownerId: input.source.project.ownerId,
        actorId: input.actorId ?? null,
        source: input.entrySource,
        connectionId: input.source.connection.id,
        request,
        route,
        definition,
        scope: input.scope ?? "manual",
        option,
        policy: "advisory",
      });
    },
  };
}
export function readAiPaymentConsent(value: unknown) {
  return readActionPaymentConsent(value, aiPaymentConsentSchema);
}
export function aiPaymentReceipt(
  consent: unknown,
  amountUsd: string | null,
  state: string,
  free = false,
): ActionPaymentReceipt | undefined {
  if (!consent) return undefined;
  const original = readAiPaymentConsent(consent);
  const known = state === "confirmed" && amountUsd !== null;
  return {
    actionId: original.id,
    quoteId: original.id,
    option: original.option,
    state: free ? "free" : known ? "settled" : state === "pending" ? "pending" : "unknown",
    charge: {
      value: free ? "0" : known ? amountUsd : null,
      unit: original.option.payableUnit,
      certainty: free ? "free" : known ? "measured" : "unknown",
    },
  };
}
export function aiPaymentGuard(consent: unknown): NativeRequestGuard | undefined {
  if (!consent) return undefined;
  const original = readAiPaymentConsent(consent);
  return {
    lockBusiness: async (tx) => {
      await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${original.connectionId} FOR UPDATE`;
    },
    assertRequest: async (tx) => {
      readAiPaymentConsent(consent);
      const row = await tx.providerConnection.findUnique({
        where: { id: original.connectionId },
        select: {
          projectId: true,
          provider: true,
          credentialSource: true,
          credentialsEncrypted: true,
          enabled: true,
          status: true,
          project: { select: { ownerId: true } },
        },
      });
      if (
        !row?.enabled ||
        row.status !== "connected" ||
        row.credentialSource !== "own" ||
        row.provider !== original.option.providerId ||
        paymentFingerprint([
          row.projectId,
          row.project.ownerId,
          original.connectionId,
          row.credentialSource,
          row.credentialsEncrypted,
          original.option,
        ]) !== original.route
      )
        throw new ActionPaymentError("payment_quote_changed");
    },
  };
}

export function bindAiPaymentExecution(consent: unknown, executionId: string) {
  if (!consent) return undefined;
  const original = readAiPaymentConsent(consent);
  if (original.executionId && original.executionId !== executionId)
    throw new ActionPaymentError("payment_quote_changed");
  return sealActionPaymentConsent({ ...original, executionId });
}
export function assertAiPaymentDefinition(
  consent: unknown,
  input: {
    projectId: string;
    actorId: string;
    feature: string;
    definition: unknown;
    scope: "manual" | "recurring";
    executionId?: string;
  },
) {
  if (!consent) return;
  const original = readAiPaymentConsent(consent);
  if (
    original.projectId !== input.projectId ||
    original.actorId !== input.actorId ||
    original.scope !== input.scope ||
    (input.executionId && original.executionId !== input.executionId) ||
    original.definition !==
      paymentFingerprint([input.feature, "advisory", input.scope, input.definition])
  )
    throw new ActionPaymentError("payment_quote_changed");
}

export function bindAiPaymentSchedule(consent: unknown, scheduleId: string) {
  if (!consent) return undefined;
  const original = readAiPaymentConsent(consent);
  if (
    original.scope !== "recurring" ||
    original.executionId ||
    (original.recurringScheduleId && original.recurringScheduleId !== scheduleId)
  )
    throw new ActionPaymentError("payment_quote_changed");
  return sealActionPaymentConsent({ ...original, recurringScheduleId: scheduleId });
}
