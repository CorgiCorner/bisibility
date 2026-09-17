"use client";

import type { CoreMessages } from "@/i18n/core-messages.generated";
import { useTranslations } from "next-intl";

export type StatusPillMessageKey = keyof CoreMessages["shared"]["controls"]["status"];

/** Localized text is a client leaf so the StatusPill surface remains server-callable. */
export function StatusPillText({ messageKey }: Readonly<{ messageKey: StatusPillMessageKey }>) {
  const t = useTranslations("shared.controls.status");
  return t(messageKey);
}
