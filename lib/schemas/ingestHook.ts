import { z } from "zod";

const idSchema = z.string().trim().min(1).max(120);

export const createIngestHookSchema = z.object({
  label: z.string().trim().min(1).max(80),
  projectId: idSchema,
});

export const mutateIngestHookSchema = z.object({
  hookId: idSchema,
  projectId: idSchema,
});

export type CreateIngestHookInput = z.infer<typeof createIngestHookSchema>;
export type MutateIngestHookInput = z.infer<typeof mutateIngestHookSchema>;
