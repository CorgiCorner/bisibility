import { z } from "zod";

export const waitlistSources = [
  "featured_company",
  "landing_capture",
  "cloud_waitlist",
  "cloud_pricing",
  "changelog",
  "settings_notify",
  "settings_feedback",
] as const;
export const waitlistCloudPrices = ["9", "19", "39", "custom"] as const;

export type WaitlistSource = (typeof waitlistSources)[number];
export type WaitlistCloudPrice = (typeof waitlistCloudPrices)[number];

export const emailSchema = z
  .string()
  .trim()
  .max(254, "Enter an email address under 255 characters.")
  .pipe(z.email("Enter a valid email address."));

export const verificationTokenSchema = z
  .string()
  .trim()
  .min(1, "Verification token must not be empty.")
  .max(2048, "Verification token is too long.")
  .optional();

const cloudPriceSchema = z.union([z.enum(waitlistCloudPrices), z.literal("")]).optional();

// Whole dollars from 1 through 9999: first digit 1-9, then up to three more
// digits. Exported so the widget cannot accept a value the server will reject
// (a custom amount must round-trip through one rule).
export const cloudPriceCustomSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{0,3}$/, "Enter a whole dollar amount from 1 to 9999.");

const freeEmailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "gmx.com",
  "zoho.com",
  "mail.com",
  "yandex.com",
  "fastmail.com",
  "hey.com",
  "qq.com",
]);

export function isCompanyEmail(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1];
  return Boolean(domain) && !freeEmailDomains.has(domain);
}

export const waitlistSchema = z
  .object({
    cloudPrice: cloudPriceSchema,
    cloudPriceCustom: cloudPriceCustomSchema.optional(),
    email: emailSchema,
    prefersUsagePricing: z
      .preprocess(
        (value) => value === true || value === "on" || value === "true" || value === "1",
        z.boolean(),
      )
      .optional(),
    source: z.enum(waitlistSources),
    verificationToken: verificationTokenSchema,
  })
  .superRefine((value, context) => {
    if (value.source === "featured_company" && !isCompanyEmail(value.email)) {
      context.addIssue({
        code: "custom",
        message: "Use your work email.",
        path: ["email"],
      });
    }

    if (value.source !== "cloud_pricing") {
      return;
    }

    if (!value.cloudPrice) {
      context.addIssue({
        code: "custom",
        message: "Pick a monthly price.",
        path: ["cloudPrice"],
      });
      return;
    }

    if (value.cloudPrice === "custom" && !value.cloudPriceCustom) {
      context.addIssue({
        code: "custom",
        message: "Enter your monthly price.",
        path: ["cloudPriceCustom"],
      });
    }
  });

export type WaitlistFormValues = z.infer<typeof waitlistSchema>;
