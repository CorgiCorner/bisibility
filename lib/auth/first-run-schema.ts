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

export type SetupValidationMessages = {
  email: string;
  nameLong: string;
  nameRequired: string;
  otp: string;
};

/** Builds request-local UI validation without changing server-side error defaults. */
export function createSetupCompletionSchema(messages: SetupValidationMessages) {
  const otp = z.string().regex(/^\d?$/, messages.otp);
  return z.object({
    email: z.email(messages.email),
    name: z.string().trim().min(1, messages.nameRequired).max(100, messages.nameLong),
    otp: z.array(otp).length(6, messages.otp),
  });
}

export type SetupFormValues = z.infer<typeof setupCompletionSchema>;
