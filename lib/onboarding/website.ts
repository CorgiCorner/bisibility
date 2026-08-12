import { z } from "zod";

const websiteValueSchema = z
  .string()
  .trim()
  .min(1, "Enter your website.")
  .max(2_048, "Enter a shorter website URL.")
  .refine((value) => {
    try {
      const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
      const url = new URL(candidate);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.hostname.includes(".") &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Enter a website like example.com.");

export const onboardingWebsiteSchema = z.object({
  website: websiteValueSchema,
});

export type OnboardingWebsiteInput = z.input<typeof onboardingWebsiteSchema>;

export type WebsiteProjectIdentity = {
  domain: string;
  name: string;
};
