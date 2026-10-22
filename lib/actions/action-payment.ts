"use server";
import { assessActionPayments } from "@/lib/action-payment/batch";
import { acceptedActionPaymentSchema } from "@/lib/action-payment/schema";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const assessmentSchema = z.object({
  projectId: z.string().min(1).max(120),
  quotes: z.array(acceptedActionPaymentSchema).min(1).max(50),
});
export async function assessActionPaymentsAction(input: unknown) {
  const data = parseActionInput(assessmentSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "project" });
  return assessActionPayments({ projectId: project.id, actorId: actor.id, quotes: data.quotes });
}
