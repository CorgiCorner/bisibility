"use client";

import { emergencyRecoveryStyles } from "@/components/i18n/EmergencyRecovery";
import { Button } from "@/components/ui/Button";
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
    <main style={emergencyRecoveryStyles.main}>
      <div style={emergencyRecoveryStyles.content}>
        <h1 style={emergencyRecoveryStyles.title}>{t("title")}</h1>
        <p style={emergencyRecoveryStyles.description}>{t("description")}</p>
        <div style={emergencyRecoveryStyles.actions}>
          <Button
            style={{ ...emergencyRecoveryStyles.button, ...emergencyRecoveryStyles.primary }}
            onClick={() => window.location.reload()}
            type="button"
          >
            {t("retry")}
          </Button>
        </div>
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
      <body style={{ margin: 0 }}>
        <GlobalErrorBoundaryContent error={error} />
      </body>
    </html>
  );
}
