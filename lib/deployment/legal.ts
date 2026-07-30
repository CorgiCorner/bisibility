import "server-only";

import { isCloud } from "@/lib/deployment/deployment";

export type LegalConsentLinks = {
  privacyHref: string | null;
  termsHref: string | null;
};

export type LegalOperator = {
  contactEmail: string | null;
  name: string | null;
};

function trimmedValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function sanitizeLegalUrl(value: string | undefined): string | null {
  const trimmed = trimmedValue(value);

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
    return trimmed;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

export function legalConsentLinks(
  termsUrl = process.env.LEGAL_TERMS_URL,
  privacyUrl = process.env.LEGAL_PRIVACY_URL,
): LegalConsentLinks | null {
  if (isCloud) {
    return {
      privacyHref: "/privacy",
      termsHref: "/terms",
    };
  }

  const links = {
    privacyHref: sanitizeLegalUrl(privacyUrl),
    termsHref: sanitizeLegalUrl(termsUrl),
  };

  return links.privacyHref || links.termsHref ? links : null;
}

export function legalOperator(
  name = process.env.LEGAL_OPERATOR_NAME,
  contactEmail = process.env.LEGAL_CONTACT_EMAIL,
): LegalOperator {
  return {
    contactEmail: trimmedValue(contactEmail),
    name: trimmedValue(name),
  };
}
