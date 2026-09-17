"use client";

import { useBrowserTimeZone } from "@/components/ui/ZonedTime";
import { createUserDateTimeFormatter, type DateFormatPreference } from "@/lib/format/user-datetime";
import type { PersonalTokenData } from "@/lib/queries/personal-tokens";
import { useLocale, useTranslations } from "next-intl";

type PersonalTokenDateLabelsProps = {
  dateFormat: DateFormatPreference;
  token: Pick<PersonalTokenData, "createdAt" | "expiresAt" | "lastUsedAt">;
};

export function PersonalTokenDateLabels({
  dateFormat,
  token,
}: Readonly<PersonalTokenDateLabelsProps>) {
  const browserTimeZone = useBrowserTimeZone();
  const locale = useLocale();
  const t = useTranslations("account.security.personalTokens.dates");
  const dateTime = createUserDateTimeFormatter({
    dateFormat,
    locale,
    timezone: browserTimeZone ?? "UTC",
  });
  const expiresAt = token.expiresAt ? new Date(token.expiresAt) : null;

  return (
    <span suppressHydrationWarning>
      {t("created", { date: dateTime.formatDate(new Date(token.createdAt)) })}
      {" · "}
      {token.lastUsedAt
        ? t("lastUsed", { date: dateTime.formatDate(new Date(token.lastUsedAt)) })
        : t("neverUsed")}
      {" · "}
      {expiresAt
        ? expiresAt <= new Date()
          ? t("expired", { date: dateTime.formatDate(expiresAt) })
          : t("expires", { date: dateTime.formatDate(expiresAt) })
        : t("neverExpires")}
    </span>
  );
}
