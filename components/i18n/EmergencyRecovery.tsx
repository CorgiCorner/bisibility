"use client";

import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { useTranslations } from "next-intl";

type EmergencyRecoveryProps = {
  kind: "error" | "notFound";
  onReset?: () => void;
};

/** This recovery surface must keep working when every regular provider has failed. */
export function EmergencyRecovery({ kind, onReset }: Readonly<EmergencyRecoveryProps>) {
  const t = useTranslations("shared.emergencyRecovery");
  const copy =
    kind === "error"
      ? {
          backToApp: t("error.backToApp"),
          description: t("error.description"),
          status: t("error.status"),
          title: t("error.title"),
        }
      : {
          backToApp: t("notFound.backToApp"),
          description: t("notFound.description"),
          status: t("notFound.status"),
          title: t("notFound.title"),
        };

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 text-center text-fg">
      <div className="max-w-md">
        <p className="m-0 font-sans text-[11px] uppercase tracking-[0.5px] text-fg-muted">
          {copy.status}
        </p>
        <h1 className="mt-3 text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-fg-muted">{copy.description}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {kind === "error" ? (
            <button
              className="rounded-control bg-accent-solid px-4 py-2 text-sm font-semibold text-accent-contrast"
              onClick={onReset}
              type="button"
            >
              <ArrowClockwise aria-hidden size={16} weight="regular" />
              {t("error.retry")}
            </button>
          ) : null}
          <a
            className="rounded-control border border-border-control bg-bg-elev px-4 py-2 text-sm font-semibold text-fg"
            href="/app"
          >
            {copy.backToApp}
          </a>
        </div>
      </div>
    </main>
  );
}
