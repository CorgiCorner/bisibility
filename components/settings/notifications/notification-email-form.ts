import { z } from "zod";

export const notificationEmailSchema = z.object({
  email: z.string().trim().email("Enter a valid notification email.").max(320),
});

export const verificationCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});

export type NotificationEmailForm = z.infer<typeof notificationEmailSchema>;
export type VerificationCodeForm = z.infer<typeof verificationCodeSchema>;
