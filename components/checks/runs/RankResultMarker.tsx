"use client";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDisplayDateTime } from "@/lib/dates/format";
import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import { useTranslations } from "next-intl";
export function RankResultMarker({
  evidence,
  position,
}: {
  evidence: EvidenceProjection;
  position: number | null;
}) {
  const t = useTranslations("shared.rankEvidence");
  const display = useDateDisplay();
  const partial = evidence.result === "partial";
  const recovered = evidence.result === "recovered";
  if (!partial && !recovered) return null;
  return (
    <span
      className="grid min-w-0 gap-0.5 text-xs leading-4 text-fg [&_[data-status-chip-tone]]:h-auto [&_[data-status-chip-tone]]:min-h-5 [&_[data-status-chip-tone]]:whitespace-normal [&_[data-status-chip-tone]]:py-1"
      data-rank-evidence={evidence.result}
    >
      <span className="font-semibold tabular-nums">
        {position === null
          ? t(partial ? "partialNoMatch" : "noMatch")
          : t("position", { position })}
      </span>
      <StatusChip
        label={
          partial
            ? evidence.returnedDepth === null
              ? t("partialUnknownDepth")
              : t("partialDepth", { depth: evidence.returnedDepth })
            : t("recovered")
        }
        tone={partial ? "attention" : "positive"}
      />
      <span className="text-fg-muted whitespace-normal break-words">
        {t("originalTime", {
          date: `${formatDisplayDateTime(new Date(evidence.originalCheckedAt), display)} (${display.timeZone})`,
        })}
      </span>
      {recovered && (evidence.cost === "unknown" || evidence.cost === "under_review") ? (
        <span className="text-fg-muted">{t("costUnknown")}</span>
      ) : null}
    </span>
  );
}
