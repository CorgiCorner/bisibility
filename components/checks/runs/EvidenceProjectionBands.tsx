"use client";
import { Button } from "@/components/ui/Button";
import { type ProjectionKey, projectionKeys } from "@/lib/provider-evidence/projection/model";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { useTranslations } from "next-intl";

const tones: Record<ProjectionKey, string> = {
  under_review: "warning",
  cost_conflict: "warning",
  provider_error: "error",
  missing: "neutral",
  partial: "neutral",
  recovered: "success",
};
export function EvidenceProjectionBands({
  counts,
  onFilterChange,
}: Readonly<{
  counts?: Partial<Record<ProjectionKey, number>>;
  onFilterChange: (filter: ProjectionKey) => void;
}>) {
  const t = useTranslations("projectRankTracker.checks.evidence");
  return (
    <>
      {projectionKeys.map((key) =>
        counts?.[key] ? (
          <div
            key={key}
            data-evidence-tone={tones[key]}
            className="group/evidence mx-4 mt-3 flex flex-wrap items-start gap-2.5 rounded-control border border-border bg-bg-sunken px-3.5 py-3 data-[evidence-tone=warning]:border-yellow/35 data-[evidence-tone=warning]:bg-yellow/10 data-[evidence-tone=error]:border-red/35 data-[evidence-tone=error]:bg-red/8 data-[evidence-tone=success]:border-green/35 data-[evidence-tone=success]:bg-green/8"
          >
            {key === "recovered" ? (
              <CheckCircleIcon
                weight="regular"
                aria-hidden
                size={17}
                className="mt-0.5 shrink-0 text-green-text"
              />
            ) : (
              <WarningCircleIcon
                weight="regular"
                aria-hidden
                size={17}
                className="mt-0.5 shrink-0 text-fg-muted group-data-[evidence-tone=error]/evidence:text-red-text group-data-[evidence-tone=warning]/evidence:text-yellow-text"
              />
            )}
            <div className="min-w-0 flex-1 text-ui-body leading-relaxed">
              <strong>
                {t(key)} · {counts[key]}
              </strong>
              <p className="m-0 text-fg-muted">{t(`${key}Description`)}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              endIcon={<CaretRightIcon weight="regular" aria-hidden size={12} />}
              onClick={() => onFilterChange(key)}
            >
              {t("viewChecks")}
            </Button>
          </div>
        ) : null,
      )}
    </>
  );
}
