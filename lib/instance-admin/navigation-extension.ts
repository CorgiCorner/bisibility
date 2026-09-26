import "server-only";
import type { AppLocale } from "@/i18n/config";

export function adminNavigationExtension(_locale: AppLocale): { href: string; label: string }[] {
  return [];
}
