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
  .pipe(
    z
      .string()
      .regex(/^https?:\/\//i, "Use an http(s) URL.")
      .pipe(z.url("Use a valid URL."))
      .optional(),
  );

export const signalSeveritySchema = z.enum(["info", "warning", "critical"]);

export const createSignalNoteSchema = z.object({
  keywordId: optionalIdSchema,
  note: z.string().trim().min(1, "Add a note.").max(2000, "Keep the note under 2000 characters."),
  projectId: z.string().trim().min(1),
  severity: signalSeveritySchema.default("info"),
  url: optionalUrlSchema,
});

export const removeSignalNoteSchema = z.object({
  projectId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
});

export type CreateSignalNoteInput = z.input<typeof createSignalNoteSchema>;
export type CreateSignalNoteValues = z.infer<typeof createSignalNoteSchema>;
export type RemoveSignalNoteInput = z.infer<typeof removeSignalNoteSchema>;
export type SignalSeverityInput = z.infer<typeof signalSeveritySchema>;
