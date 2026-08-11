import { z } from "zod";

const accountEmailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .max(320, "Email address is too long.")
  .transform((email) => email.toLowerCase());

export const requestAccountEmailChangeSchema = z.object({
  newEmail: accountEmailSchema,
});

export const confirmAccountEmailChangeSchema = requestAccountEmailChangeSchema.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});

export const requestCurrentAccountEmailVerificationSchema = z.object({
  email: accountEmailSchema,
});

export const confirmCurrentAccountEmailVerificationSchema =
  requestCurrentAccountEmailVerificationSchema.extend({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
  });

export type RequestAccountEmailChangeInput = z.infer<typeof requestAccountEmailChangeSchema>;
export type ConfirmAccountEmailChangeInput = z.infer<typeof confirmAccountEmailChangeSchema>;
export type RequestCurrentAccountEmailVerificationInput = z.infer<
  typeof requestCurrentAccountEmailVerificationSchema
>;
export type ConfirmCurrentAccountEmailVerificationInput = z.infer<
  typeof confirmCurrentAccountEmailVerificationSchema
>;
