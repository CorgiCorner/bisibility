import { z } from "zod";

export const accountEmailSchema = z.object({
  email: z.string().trim().email("Enter a valid account email.").max(320),
});

export const verificationCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});

export type AccountEmailForm = z.infer<typeof accountEmailSchema>;
export type VerificationCodeForm = z.infer<typeof verificationCodeSchema>;
