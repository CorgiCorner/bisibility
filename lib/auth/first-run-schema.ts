import { z } from "zod";

const otpDigitSchema = z.string().regex(/^\d?$/, "Enter the 6-digit code.");

export function emptySetupOtp() {
  return Array.from({ length: 6 }, () => "");
}

export const setupAccountSchema = z.object({
  email: z.email("Enter a valid email address."),
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(100, "Keep your name under 100 characters."),
});

export const setupCompletionSchema = setupAccountSchema.extend({
  otp: z.array(otpDigitSchema).length(6, "Enter the 6-digit code."),
});

export type SetupFormValues = z.infer<typeof setupCompletionSchema>;
