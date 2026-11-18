import { z } from "zod";
import { type ModelColumnResult, modelColumnResultSchema } from "./types";

/** Server transport facts only. These values never authorize another provider request. */
export const modelInterruptionSchema = z
  .object({
    version: z.literal(1),
    reason: z.enum(["aborted", "timeout", "rejected", "unreported", "not_called"]),
    requestBytes: z
      .number()
      .int()
      .min(1)
      .max(1024 * 1024),
    requestTokens: z
      .number()
      .int()
      .min(1)
      .max(1024 * 1024),
    reasoning: z.boolean(),
    elapsedMs: z.number().int().nonnegative().max(300_000),
  })
  .strict();
export type ModelInterruption = z.infer<typeof modelInterruptionSchema>;

const interruptedObservation = z
  .object({
    kind: z.enum(["interrupted", "not_called"]),
    result: modelColumnResultSchema,
    interruption: modelInterruptionSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const notCalled = value.interruption.reason === "not_called";
    if (
      (value.kind === "not_called") !== notCalled ||
      (notCalled && (value.result.state !== "cancelled" || value.result.answer !== null))
    )
      ctx.addIssue({
        code: "custom",
        message: "Never-called evidence requires a cancelled, unanswered transport.",
      });
  });

export function modelObservation(
  response: ModelColumnResult | null,
  interruption?: ModelInterruption,
) {
  return interruption && response
    ? interruptedObservation.parse({
        kind: interruption.reason === "not_called" ? "not_called" : "interrupted",
        result: response,
        interruption,
      })
    : response;
}

/** Old observations remain valid; interruption metadata is not part of the public answer. */
export function readModelObservation(value: unknown) {
  const interrupted = interruptedObservation.safeParse(value);
  if (interrupted.success)
    return { response: interrupted.data.result, interruption: interrupted.data.interruption };
  if (value && typeof value === "object" && "kind" in value && value.kind === "not_called")
    throw new Error("Invalid retained never-called evidence");
  return { response: value, interruption: undefined };
}
