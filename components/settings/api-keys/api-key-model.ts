import type { ApiKeyScope } from "@/lib/schemas/apiKey";

export type ApiKeyData = {
  createdLabel: string;
  expiresLabel: string;
  id: string;
  isExpired: boolean;
  lastUsedLabel: string;
  maskedValue: string;
  name: string;
};

export type IssuedApiKey = {
  expiresInDays?: 30 | 90 | 365 | null;
  maskedValue: string;
  name: string;
  raw: string;
  scope?: ApiKeyScope;
};

export const apiKeyScopeOptions = [
  {
    desc: "Read rankings, keywords and project metadata.",
    label: "Read only",
    value: "read",
  },
  {
    desc: "Read and update keywords, checks, tags and exports.",
    label: "Read and write",
    value: "write",
  },
  {
    desc: "Full project API access, including admin operations.",
    label: "Full access",
    value: "admin",
  },
] satisfies { desc: string; label: string; value: ApiKeyScope }[];

export function apiKeyScopeLabel(scope: ApiKeyScope) {
  return apiKeyScopeOptions.find((option) => option.value === scope)?.label ?? "Full access";
}

export const apiKeyExpiryOptions = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: null, label: "No expiry" },
] as const;

// Labels the CHOICE the user made in the picker, so it mirrors the option captions.
// The state a key is in ("never expires", "expires <date>") is worded by
// apiKeyExpiryLabel in lib/queries/api-key-settings.ts; keep the two vocabularies apart.
export function apiKeyExpiryChoiceLabel(days: IssuedApiKey["expiresInDays"]) {
  if (days === null) return "No expiry";
  if (days === undefined) return null;
  return `${days} days`;
}

export function storedPrefix(maskedValue: string) {
  const firstMask = maskedValue.indexOf("*");
  const withoutTrailingMask = firstMask < 0 ? maskedValue : maskedValue.slice(0, firstMask);

  return withoutTrailingMask === maskedValue ? maskedValue.split("*")[0] : withoutTrailingMask;
}
