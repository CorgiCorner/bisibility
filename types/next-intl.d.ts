import type { AppLocale } from "@/i18n/config";
import type { AppMessages } from "@/i18n/core-messages";
import type { formats } from "@/i18n/formats";

declare module "next-intl" {
  interface AppConfig {
    Formats: typeof formats;
    Locale: AppLocale;
    Messages: AppMessages;
  }
}
