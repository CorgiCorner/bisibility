import { z } from "zod";

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit authenticator code.");

export const backupCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/, "Enter a backup code in the xxxxx-xxxxx format.");

export const twoFactorMethodSchema = z.enum(["totp", "backup_code"]);
export type TwoFactorMethod = z.infer<typeof twoFactorMethodSchema>;

type ManagementSchemaOptions = {
  factorRequired: boolean;
  passwordRequired: boolean;
};

export function twoFactorManagementSchema({
  factorRequired,
  passwordRequired,
}: ManagementSchemaOptions) {
  return z
    .object({
      code: z.string().trim().max(64).default(""),
      method: twoFactorMethodSchema.default("totp"),
      password: z.string().max(1024).default(""),
    })
    .superRefine((value, context) => {
      if (passwordRequired && !value.password) {
        context.addIssue({
          code: "custom",
          message: "Enter your account password.",
          path: ["password"],
        });
      }
      if (!factorRequired) return;

      const factorSchema = value.method === "totp" ? totpCodeSchema : backupCodeSchema;
      const parsed = factorSchema.safeParse(value.code);
      if (!parsed.success) {
        context.addIssue({
          code: "custom",
          message: parsed.error.issues[0]?.message ?? "Enter a valid current factor.",
          path: ["code"],
        });
      }
    });
}

export type TwoFactorManagementInput = z.infer<ReturnType<typeof twoFactorManagementSchema>>;

export const completeTwoFactorEnrollmentSchema = z
  .object({
    code: totpCodeSchema,
    enrollmentId: z.string().uuid(),
  })
  .strict();

export type CompleteTwoFactorEnrollmentInput = z.infer<typeof completeTwoFactorEnrollmentSchema>;
