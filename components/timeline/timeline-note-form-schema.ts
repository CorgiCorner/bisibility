import type { useTranslations } from "next-intl";
import { z } from "zod";

type TimelineFormTranslations = ReturnType<typeof useTranslations<"projectTimeline.form">>;

const optionalIdSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

export function createTimelineNoteFormSchema(t: TimelineFormTranslations) {
  const optionalUrlSchema = z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .superRefine((value, ctx) => {
      if (!value) return;
      if (value.startsWith("/")) {
        if (!/^\/\S*$/.test(value)) ctx.addIssue({ code: "custom", message: t("validationUrl") });
        return;
      }
      if (!/^https?:\/\//i.test(value)) {
        ctx.addIssue({ code: "custom", message: t("validationUrlProtocol") });
        return;
      }
      if (!z.url().safeParse(value).success) {
        ctx.addIssue({ code: "custom", message: t("validationUrl") });
      }
    });
  const optionalDaySchema = z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .pipe(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    );

  return z.object({
    happenedOn: optionalDaySchema,
    keywordId: optionalIdSchema,
    note: z
      .string()
      .trim()
      .min(1, t("validationNoteRequired"))
      .max(2000, t("validationNoteLength")),
    projectId: z.string().trim().min(1),
    severity: z.enum(["info", "warning", "critical"]).default("info"),
    url: optionalUrlSchema,
  });
}
