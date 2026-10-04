import { z } from "zod";

const contextText = z.string().trim().max(4000);

export const projectContextSchema = z
  .object({
    business: contextText,
    audience: contextText,
    products: contextText,
    goals: contextText,
    agentRules: contextText,
  })
  .strict();

export const projectContextActionSchema = projectContextSchema.extend({
  projectId: z.string().trim().min(1).max(120),
});

export type ProjectContextInput = z.infer<typeof projectContextSchema>;
export type ProjectContextResource = ProjectContextInput & { updatedAt: string | null };

export const emptyProjectContext: ProjectContextResource = {
  business: "",
  audience: "",
  products: "",
  goals: "",
  agentRules: "",
  updatedAt: null,
};
