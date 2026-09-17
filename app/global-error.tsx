"use client";

import { type AppLocale, DEFAULT_LOCALE, htmlLanguage } from "@/i18n/config";
import { EmergencyMessagesProvider } from "@/i18n/EmergencyMessagesProvider";
import type { EmergencyCatalogs } from "@/i18n/emergency-locale";
import { reportAppError } from "@/lib/observability/error-reporting";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
};

type EmergencyLocaleBoundaryProps = {
  activeLocales?: readonly AppLocale[];
  catalogs?: EmergencyCatalogs;
};

function GlobalErrorContent() {
  const t = useTranslations("shared.globalError");

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 text-center">
      <div className="max-w-md">
        <h1 className="font-sans text-2xl font-semibold text-fg">{t("title")}</h1>
        <p className="mt-3 text-sm leading-6 text-fg-muted">{t("description")}</p>
        <button
          className="mt-6 rounded-control bg-accent-solid px-4 py-2 text-sm font-semibold text-accent-contrast"
          onClick={() => window.location.reload()}
          type="button"
        >
          {t("retry")}
        </button>
      </div>
    </main>
  );
}

export function GlobalErrorBoundaryContent({
  activeLocales,
  catalogs,
  error,
}: Readonly<GlobalErrorProps & Pick<EmergencyLocaleBoundaryProps, "activeLocales" | "catalogs">>) {
  useEffect(() => {
    reportAppError(error, { digest: error.digest });
  }, [error]);

  return (
    <EmergencyMessagesProvider activeLocales={activeLocales} catalogs={catalogs}>
      <GlobalErrorContent />
    </EmergencyMessagesProvider>
  );
}

export default function GlobalError({ error }: Readonly<GlobalErrorProps>) {
  return (
    <html lang={htmlLanguage(DEFAULT_LOCALE)}>
      <body>
        <GlobalErrorBoundaryContent error={error} />
      </body>
    </html>
  );
}
