import { z } from "zod";

const projectIdSchema = z.string().trim().min(1).max(120);

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag name is required.")
  .max(48, "Tag names are up to 48 characters.");

export const tagNameFormSchema = z.object({ name: tagNameSchema });

export type TagNameFormValues = z.infer<typeof tagNameFormSchema>;

export const createTagSchema = z.object({ name: tagNameSchema, projectId: projectIdSchema });

export const deleteTagSchema = z.object({ name: tagNameSchema, projectId: projectIdSchema });

export const renameTagSchema = z
  .object({ fromName: tagNameSchema, projectId: projectIdSchema, toName: tagNameSchema })
  .refine((data) => data.fromName !== data.toName, {
    message: "Choose a different tag name.",
    path: ["toName"],
  });
