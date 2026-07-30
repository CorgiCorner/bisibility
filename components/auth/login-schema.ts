import { z } from "zod";

export const OTP_LENGTH = 6;

const otpDigitSchema = z.string().regex(/^\d?$/, "Enter the 6-digit code.");

export function emptyOtpDigits() {
  return Array.from({ length: OTP_LENGTH }, () => "");
}

export const loginSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  otp: z.array(otpDigitSchema).length(OTP_LENGTH, "Enter the 6-digit code."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
