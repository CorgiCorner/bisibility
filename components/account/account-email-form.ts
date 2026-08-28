import { z } from "zod";

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit verification code.");

const emailSchema = z.string().trim().email("Enter a valid account email.").max(320);

export const accountEmailSchema = z.object({
  email: emailSchema,
});

export const verificationCodeSchema = z.object({
  code: codeSchema,
});

/** Step two of a change: the code proving the current address, plus the address to move to. */
export const accountEmailChangeSchema = z.object({
  currentCode: codeSchema,
  newEmail: emailSchema,
});

export type AccountEmailForm = z.infer<typeof accountEmailSchema>;
export type VerificationCodeForm = z.infer<typeof verificationCodeSchema>;
export type AccountEmailChangeForm = z.infer<typeof accountEmailChangeSchema>;
