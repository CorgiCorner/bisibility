import { z } from "zod";

export const MAX_ONBOARDING_WEBSITE_LENGTH = 2_048;

export type OnboardingWebsiteValidationMessages = {
  invalid: string;
  required: string;
  tooLong: string;
};

function isTrackableWebsite(value: string) {
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
}

function websiteValueSchemaFor(messages?: OnboardingWebsiteValidationMessages) {
  return messages
    ? z
        .string()
        .trim()
        .min(1, messages.required)
        .max(MAX_ONBOARDING_WEBSITE_LENGTH, messages.tooLong)
        .refine(isTrackableWebsite, messages.invalid)
    : z
        .string()
        .trim()
        .min(1, "Enter your website.")
        .max(MAX_ONBOARDING_WEBSITE_LENGTH, "Enter a shorter website URL.")
        .refine(isTrackableWebsite, "Enter a website like example.com.");
}

export const onboardingWebsiteSchema = z.object({
  website: websiteValueSchemaFor(),
});

/** Builds a request-local UI schema while preserving the server action contract. */
export function onboardingWebsiteSchemaFor(messages: OnboardingWebsiteValidationMessages) {
  return z.object({ website: websiteValueSchemaFor(messages) });
}

export type OnboardingWebsiteInput = z.input<typeof onboardingWebsiteSchema>;

export type WebsiteProjectIdentity = {
  domain: string;
  name: string;
};
