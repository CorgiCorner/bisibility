import "server-only";
import type { AppLocale } from "@/i18n/config";

export async function renderAccountUsageExtension(_input: {
  projectRef: string;
  locale: AppLocale;
}) {
  return null;
}
