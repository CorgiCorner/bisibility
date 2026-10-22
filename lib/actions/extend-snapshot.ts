"use server";

import { acceptedActionPaymentSchema } from "@/lib/action-payment/schema";
import { paymentFailure } from "@/lib/action-payment/session";
import { extendSnapshot } from "@/lib/serp/extend-snapshot";
import { prepareSnapshotExtensionPayment } from "@/lib/serp/snapshot-payment";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateRankCheckViews,
} from "./_shared";

const schema = z.object({
  projectId: z.string().min(1).max(120),
  checkId: z.string().regex(/^check_[a-zA-Z0-9]+$/),
  nextStart: z.number().int().min(10).max(90).multipleOf(10),
  paymentOptionId: z.string().min(1).max(256).optional(),
});

export async function extendSerpSnapshot(input: unknown) {
  const data = parseActionInput(
    schema.extend({ acceptedPayment: acceptedActionPaymentSchema.optional() }),
    input,
  );
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  const result = await extendSnapshot({ ...data, actorId: actor.id, projectId: project.id });
  revalidateRankCheckViews();
  return result;
}

export async function previewSerpSnapshotExtension(input: unknown) {
  const data = parseActionInput(schema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  try {
    const result = await prepareSnapshotExtensionPayment(
      { ...data, actorId: actor.id, projectId: project.id },
      false,
    );
    if (!result.ok) return result;
    return {
      ok: true as const,
      payment: result.payment.quote,
      paymentOptions: result.payment.options,
    };
  } catch (error) {
    const failure = paymentFailure(error);
    if (failure) return failure;
    throw error;
  }
}
