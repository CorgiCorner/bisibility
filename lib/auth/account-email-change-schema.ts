import { z } from "zod";

const accountEmailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .max(320, "Email address is too long.")
  .transform((email) => email.toLowerCase());

const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit verification code.");

const accountEmailChangeTargetSchema = z.object({
  newEmail: accountEmailSchema,
});

/** `currentCode` proves control of the address already on the account. */
export const requestAccountEmailChangeSchema = accountEmailChangeTargetSchema.extend({
  currentCode: verificationCodeSchema,
});

export const confirmAccountEmailChangeSchema = accountEmailChangeTargetSchema.extend({
  code: verificationCodeSchema,
});

export const requestCurrentAccountEmailVerificationSchema = z.object({
  email: accountEmailSchema,
});

export const confirmCurrentAccountEmailVerificationSchema =
  requestCurrentAccountEmailVerificationSchema.extend({
    code: verificationCodeSchema,
  });

export type RequestAccountEmailChangeInput = z.infer<typeof requestAccountEmailChangeSchema>;
export type ConfirmAccountEmailChangeInput = z.infer<typeof confirmAccountEmailChangeSchema>;
export type RequestCurrentAccountEmailVerificationInput = z.infer<
  typeof requestCurrentAccountEmailVerificationSchema
>;
export type ConfirmCurrentAccountEmailVerificationInput = z.infer<
  typeof confirmCurrentAccountEmailVerificationSchema
>;
