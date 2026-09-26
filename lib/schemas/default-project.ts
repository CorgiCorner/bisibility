import { isPublicIdOfType } from "@/lib/db/public-id";
import { z } from "zod";

// Shared by the project switcher and the server action. `null` clears the default.
export const defaultProjectInputSchema = z
  .object({
    projectId: z
      .string()
      .refine((value) => isPublicIdOfType(value, "prj"), "Project not found.")
      .nullable(),
  })
  .strict();

export type DefaultProjectInput = z.infer<typeof defaultProjectInputSchema>;
