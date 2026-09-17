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
    .pipe(
      z
        .string()
        .regex(/^https?:\/\//i, t("validationUrlProtocol"))
        .pipe(z.url(t("validationUrl")))
        .optional(),
    );

  return z.object({
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
