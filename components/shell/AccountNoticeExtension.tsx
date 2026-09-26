import "server-only";
import type { AppLocale } from "@/i18n/config";
import type { ReactNode } from "react";

export async function renderAccountNoticeExtension(
  _input: Readonly<{ locale: AppLocale }>,
): Promise<{ content: ReactNode } | null> {
  return null;
}
