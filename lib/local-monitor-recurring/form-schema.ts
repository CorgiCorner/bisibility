import { z } from "zod";
import { exactCents } from "./cost";

const money = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,37})(?:\.\d{1,18})?$/u)
  .pipe(z.string().refine((value) => exactCents(value) > 0n));
export const recurringFormSchema = z
  .object({
    connectionId: z.string().min(1),
    scheduleId: z.string().min(1),
    maximumPerOccurrenceUsd: money,
    maximumTotalUsd: money,
    maximumOccurrences: z.number().int().min(1).max(10000),
    validUntil: z.string().refine((value) => Number.isFinite(new Date(value).getTime())),
  })
  .superRefine((value, ctx) => {
    // A malformed/empty draft is a field issue, never an exact-arithmetic exception.
    if (
      !money.safeParse(value.maximumTotalUsd).success ||
      !money.safeParse(value.maximumPerOccurrenceUsd).success
    )
      return;
    if (exactCents(value.maximumTotalUsd) < exactCents(value.maximumPerOccurrenceUsd))
      ctx.addIssue({
        code: "custom",
        path: ["maximumTotalUsd"],
        message: "Total ceiling must cover one occurrence.",
      });
  });
export type RecurringFormValues = z.input<typeof recurringFormSchema>;
