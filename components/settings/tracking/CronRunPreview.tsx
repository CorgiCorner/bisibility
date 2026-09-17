import { intlLocale } from "@/i18n/config";
import type { CronPreviewResult } from "@/lib/actions/settings-cron-preview";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/csr/Warning";
import { useLocale, useTranslations } from "next-intl";

export function CronRunPreview({
  pending,
  preview,
}: Readonly<{ pending: boolean; preview: CronPreviewResult }>) {
  const t = useTranslations("projectSettingsTracking.checkDefaults");
  const locale = useLocale();
  if (pending) {
    return (
      <div aria-live="polite" className="mt-3 text-[12px] text-fg-muted">
        {t("previewPending")}
      </div>
    );
  }

  if (preview.status === "invalid") {
    return (
      <div
        aria-live="polite"
        className="mt-3 flex items-start gap-2 rounded-control border border-yellow-border bg-yellow-soft px-3 py-2.5 text-[12px] text-yellow-text"
      >
        <Warning aria-hidden className="mt-0.5 shrink-0" size={15} weight="regular" />
        {preview.message === "anchors_too_close"
          ? t("previewAnchorsTooClose")
          : t("previewInvalid")}
      </div>
    );
  }

  if (preview.status !== "ready") return null;

  return (
    <div aria-live="polite" className="mt-3 rounded-control border border-border bg-bg-sunken p-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-fg">
        <CheckCircle aria-hidden className="text-green-text" size={15} weight="regular" />
        {t("previewTitle")}
      </div>
      <ol className="m-0 mt-2 grid list-none gap-2 p-0 sm:grid-cols-3">
        {preview.runs.map((run, index) => {
          const label = new Intl.DateTimeFormat(intlLocale(locale), {
            day: "numeric",
            hour: "2-digit",
            hourCycle: "h23",
            minute: "2-digit",
            month: "short",
            timeZone: preview.timezone ?? "UTC",
          }).format(new Date(run));
          return (
            <li className="font-sans tabular-nums text-[11.5px] text-fg-muted" key={run}>
              <span className="mr-1 text-fg-muted">{index + 1}.</span>
              {label}
            </li>
          );
        })}
      </ol>
      <p className="m-0 mt-2 text-[11px] text-fg-muted">{t("previewReady")}</p>
    </div>
  );
}
