import "server-only";
import type { AppLocale } from "@/i18n/config";

export function adminPageNavigationExtension(
  _locale: AppLocale,
): import("@/lib/instance-admin/routes").AdminRoute[] {
  return [];
}
