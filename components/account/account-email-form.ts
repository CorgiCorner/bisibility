import { z } from "zod";

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "invalidCode");

const emailSchema = z.string().trim().email("invalidEmail").max(320);

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
