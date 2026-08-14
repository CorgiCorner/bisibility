"use client";

import { useBrowserTimeZone } from "@/components/ui";
import { createUserDateTimeFormatter, type DateFormatPreference } from "@/lib/format/user-datetime";
import type { PersonalTokenData } from "@/lib/queries/personal-tokens";

type PersonalTokenDateLabelsProps = {
  dateFormat: DateFormatPreference;
  token: Pick<PersonalTokenData, "createdAt" | "expiresAt" | "lastUsedAt">;
};

export function PersonalTokenDateLabels({
  dateFormat,
  token,
}: Readonly<PersonalTokenDateLabelsProps>) {
  const browserTimeZone = useBrowserTimeZone();
  const dateTime = createUserDateTimeFormatter({
    dateFormat,
    timezone: browserTimeZone ?? "UTC",
  });
  const expiresAt = token.expiresAt ? new Date(token.expiresAt) : null;

  return (
    <span suppressHydrationWarning>
      created {dateTime.formatDate(new Date(token.createdAt))} ·{" "}
      {token.lastUsedAt
        ? `last used ${dateTime.formatDate(new Date(token.lastUsedAt))}`
        : "never used"}
      {" · "}
      {expiresAt
        ? `${expiresAt <= new Date() ? "expired" : "expires"} ${dateTime.formatDate(expiresAt)}`
        : "never expires"}
    </span>
  );
}
