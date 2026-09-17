"use client";

import type { CoreMessages } from "@/i18n/core-messages.generated";
import { useTranslations } from "next-intl";

export type CheckStatusMessageKey = keyof CoreMessages["shared"]["controls"]["checkStatus"];

/** Localized text keeps the status-chip wrapper available to server renderers. */
export function CheckStatusChipText({
  messageKey,
}: Readonly<{
  messageKey: CheckStatusMessageKey;
}>) {
  const t = useTranslations("shared.controls.checkStatus");
  return t(messageKey);
}
