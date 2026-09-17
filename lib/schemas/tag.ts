import { z } from "zod";

const projectIdSchema = z.string().trim().min(1).max(120);

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag name is required.")
  .max(48, "Tag names are up to 48 characters.");

export const tagNameFormSchema = z.object({ name: tagNameSchema });

export type TagNameValidationMessages = {
  required: string;
  tooLong: string;
};

/** Keeps the server schema stable while a rendered control supplies its own copy. */
export function tagNameFormSchemaFor(messages: TagNameValidationMessages) {
  return z.object({
    name: z.string().trim().min(1, messages.required).max(48, messages.tooLong),
  });
}

export type TagNameFormValues = z.infer<typeof tagNameFormSchema>;

export const createTagSchema = z.object({ name: tagNameSchema, projectId: projectIdSchema });

export const deleteTagSchema = z.object({ name: tagNameSchema, projectId: projectIdSchema });

export const renameTagSchema = z
  .object({ fromName: tagNameSchema, projectId: projectIdSchema, toName: tagNameSchema })
  .refine((data) => data.fromName !== data.toName, {
    message: "Choose a different tag name.",
    path: ["toName"],
  });
