export type ApiKeyData = {
  createdAt: string;
  createdLabel: string;
  expiresAt: string | null;
  expiresLabel: string;
  id: string;
  isExpired: boolean;
  lastUsedAt: string | null;
  lastUsedLabel: string;
  maskedValue: string;
  name: string;
};

export type IssuedApiKey = {
  expiresInDays?: 30 | 90 | 365 | null;
  maskedValue: string;
  name: string;
  raw: string;
  scope?: "admin" | "read" | "write";
};

export function storedPrefix(maskedValue: string) {
  const firstMask = maskedValue.indexOf("*");
  const withoutTrailingMask = firstMask < 0 ? maskedValue : maskedValue.slice(0, firstMask);

  return withoutTrailingMask === maskedValue ? maskedValue.split("*")[0] : withoutTrailingMask;
}
