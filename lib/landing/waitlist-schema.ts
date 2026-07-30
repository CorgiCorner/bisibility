import { z } from "zod";

export const cloudWaitlistAnchor = "cloud-waitlist";
export const cloudWaitlistHref = `/#${cloudWaitlistAnchor}`;

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

const emailSchema = z.string().trim().pipe(z.email("Enter a valid email address."));
const cloudPriceSchema = z.union([z.enum(waitlistCloudPrices), z.literal("")]).optional();

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
    cloudPriceCustom: z
      .string()
      .trim()
      .regex(/^\d{0,4}$/)
      .optional(),
    email: emailSchema,
    source: z.enum(waitlistSources),
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
