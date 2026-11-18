"use client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ScheduleChangePreview } from "@/lib/schedules/review-preview";
import { useLocale, useTranslations } from "next-intl";

export type ScheduleCostReviewDialogProps = {
  preview: ScheduleChangePreview;
  changed?: boolean;
  emptyScheduleCreated?: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};
export function ScheduleCostReviewDialog({
  preview,
  changed = false,
  emptyScheduleCreated = false,
  submitting,
  onConfirm,
  onCancel,
}: Readonly<ScheduleCostReviewDialogProps>) {
  const t = useTranslations("shared.scheduleReview");
  const locale = useLocale();
  const money = (cents: number | null) =>
    cents === null
      ? t("unknown")
      : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cents / 100);
  return (
    <Modal
      open
      onClose={onCancel}
      showClose={false}
      dismissDisabled={submitting}
      size="sm"
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button
            size="input"
            variant="ghost"
            type="button"
            disabled={submitting}
            onClick={onCancel}
          >
            {t("cancel")}
          </Button>
          <Button
            size="input"
            variant="primary"
            type="button"
            loading={submitting}
            disabled={submitting}
            onClick={onConfirm}
          >
            {t("confirm")}
          </Button>
        </>
      }
    >
      <div className="grid min-w-0 gap-4 text-sm text-fg">
        {changed ? (
          <p className="m-0 rounded-control bg-bg-band p-3" role="status">
            {t("changed")}
          </p>
        ) : null}
        {emptyScheduleCreated ? (
          <p className="m-0 text-fg-muted">{t("emptyScheduleCreated")}</p>
        ) : null}
        <dl className="m-0 grid grid-cols-2 gap-3 rounded-control bg-bg-band p-3">
          <div className="min-w-0">
            <dt className="text-xs text-fg-muted">{t("before")}</dt>
            <dd className="m-0 mt-1 break-words text-lg font-semibold">
              {money(preview.cost_before_cents)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-fg-muted">{t("after")}</dt>
            <dd className="m-0 mt-1 break-words text-lg font-semibold">
              {money(preview.cost_after_cents)}
            </dd>
          </div>
        </dl>
        <ul className="m-0 grid gap-2 pl-5">
          {preview.review_reasons.map((reason) => (
            <li key={reason}>{t(`reasons.${reason}`)}</li>
          ))}
        </ul>
        {preview.capacity?.exceeded ? (
          <div
            className="grid gap-2 rounded-control bg-[color-mix(in_srgb,var(--yellow)_8%,transparent)] p-3 text-yellow-text"
            role="alert"
          >
            <p className="m-0 font-semibold">{t("capacity")}</p>
            {Object.entries(preview.capacity.dimensions)
              .filter(([, value]) => value?.exceeded)
              .map(([dimension, value]) => (
                <p className="m-0" key={dimension}>
                  {t("capacityDetail", {
                    dimension: t(
                      `dimensions.${dimension as "scheduledKeywords" | "scheduleFrequencies" | "promptSchedules"}`,
                    ),
                    limit: value?.limit === null ? t("unknown") : String(value?.limit),
                    projected: String(value?.projected ?? t("unknown")),
                  })}
                </p>
              ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
