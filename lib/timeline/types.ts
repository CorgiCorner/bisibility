import { z } from "zod";

const optionalIdSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const optionalUrlSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .superRefine((value, ctx) => {
    if (!value) return;
    if (value.startsWith("/")) {
      if (!/^\/\S*$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "Use a valid URL." });
      }
      return;
    }
    if (!/^https?:\/\//i.test(value)) {
      ctx.addIssue({ code: "custom", message: "Use an http(s) URL." });
      return;
    }
    if (!z.url().safeParse(value).success) {
      ctx.addIssue({ code: "custom", message: "Use a valid URL." });
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

export const signalSeveritySchema = z.enum(["info", "warning", "critical"]);

export const createSignalNoteSchema = z.object({
  happenedOn: optionalDaySchema,
  keywordId: optionalIdSchema,
  note: z.string().trim().min(1, "Add a note.").max(2000, "Keep the note under 2000 characters."),
  projectId: z.string().trim().min(1),
  severity: signalSeveritySchema.default("info"),
  url: optionalUrlSchema,
});

export const searchAnnotationPagesSchema = z.object({
  projectId: z.string().trim().min(1),
  query: z.string().trim().max(200).optional().default(""),
});

export const removeSignalNoteSchema = z.object({
  projectId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
});

export type CreateSignalNoteInput = z.input<typeof createSignalNoteSchema>;
export type CreateSignalNoteValues = z.infer<typeof createSignalNoteSchema>;
export type RemoveSignalNoteInput = z.infer<typeof removeSignalNoteSchema>;
export type SignalSeverityInput = z.infer<typeof signalSeveritySchema>;
