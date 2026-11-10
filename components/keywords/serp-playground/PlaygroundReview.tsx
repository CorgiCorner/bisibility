"use client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMeasuredPaymentAmount } from "@/lib/action-payment/format";
import type { ComparisonPreview, ComparisonRun } from "@/lib/provider-comparison/types";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { providerLabels } from "./provider-labels";
export function PlaygroundReview({
  review,
  busy,
  onClose,
  launch,
  openPrevious,
}: {
  review: { preview: ComparisonPreview; previous?: ComparisonRun } | null;
  busy: boolean;
  onClose: () => void;
  launch: () => void;
  openPrevious: () => void;
}) {
  const t = useTranslations("projectRankTracker.serpPlayground");
  const locale = useLocale(),
    format = useFormatter();
  const previous = review?.previous;
  const money = (cents: number) =>
    formatMeasuredPaymentAmount(
      {
        value: String(cents / 100),
        unit: { kind: "currency", code: "USD" },
        certainty: "measured",
      },
      locale,
    );
  return (
    <Modal
      open={Boolean(review)}
      onClose={() => !busy && onClose()}
      dismissDisabled={busy}
      title={t(previous ? "repeatTitle" : "reviewTitle")}
      description={t(previous ? "repeatHelp" : "reviewHelp")}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button onClick={launch} loading={busy}>
            {t(previous ? "confirmRepeat" : "confirm")}
          </Button>
        </>
      }
    >
      {review ? (
        <div className="grid gap-4">
          {previous ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-bg-sunken p-3">
              <p className="m-0 min-w-0 text-xs text-fg-muted">
                {t("repeatNotice", {
                  date: format.dateTime(new Date(previous.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "medium",
                  }),
                })}
              </p>
              <Button variant="outline" size="sm" disabled={busy} onClick={openPrevious}>
                {t("openSaved")}
              </Button>
            </div>
          ) : null}
          <p className="m-0 break-words text-sm font-medium">{review.preview.keyword.text}</p>
          <p className="m-0 text-xs text-fg-muted">
            {review.preview.keyword.locationLabel} · {t(review.preview.keyword.device)}
          </p>
          <ul className="m-0 list-none divide-y divide-border p-0">
            {review.preview.sides.map((side) => (
              <li
                className="flex items-center justify-between gap-3 py-3 text-sm"
                key={side.provider}
              >
                <span>{providerLabels[side.provider]}</span>
                <span>{money(side.estimatedCostCents)}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 flex justify-between text-sm font-semibold">
            <span>{t("estimatedTotal")}</span>
            <span>
              {money(
                review.preview.sides.reduce((total, side) => total + side.estimatedCostCents, 0),
              )}
            </span>
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
