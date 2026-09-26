import "server-only";
import type { AppLocale } from "@/i18n/config";

export async function renderAccountSettingsExtension(_input: {
  projectRef: string;
  locale: AppLocale;
  cursor?: string | null;
}) {
  return null;
}
