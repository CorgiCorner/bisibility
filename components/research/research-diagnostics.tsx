import type {
  KeywordResearchSource,
  KeywordResearchSourceDiagnostic,
} from "@/lib/keyword-research/types";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import type { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

type DiagnosticsTranslations = ReturnType<typeof useTranslations<"projectResearch.diagnostics">>;

export function skipNote(input: {
  format: ReturnType<typeof useFormatter>;
  okLabels: string[];
  reason: "cost_limit" | "result_limit";
  resultCount: number;
  skippedLabels: string[];
  t: DiagnosticsTranslations;
}) {
  const results = input.t("results", { count: input.resultCount });
  const skippedCount = input.skippedLabels.length;
  const origin =
    input.okLabels.length > 0
      ? input.t("origin", {
          results,
          sources: input.format.list(input.okLabels, { type: "conjunction" }),
        })
      : input.t("covered", { count: input.resultCount, results });
  const subject = input.t("source", {
    count: skippedCount,
    sources: input.format.list(input.skippedLabels, { type: "conjunction" }),
  });
  const outcome =
    input.reason === "result_limit"
      ? input.t("notNeeded", { count: skippedCount })
      : input.t("costSkipped", { count: skippedCount });
  return `${origin} - ${subject} ${outcome}, ${input.t("notCharged", { count: skippedCount })}`;
}

export function warningLabel(
  source: KeywordResearchSourceDiagnostic,
  sourceLabels: Record<KeywordResearchSource, string>,
  t: DiagnosticsTranslations,
) {
  const reason = (source.reason ?? "provider_error").replaceAll("_", " ");
  return t("warning", { reason, source: sourceLabels[source.source], status: source.status });
}

export function DiagnosticsBanner({
  children,
  dismissLabel,
  onDismiss,
  tone,
}: Readonly<{
  children: ReactNode;
  dismissLabel: string;
  onDismiss: () => void;
  tone: "note" | "warning";
}>) {
  const warning = tone === "warning";
  return (
    <div
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-control border px-3 py-2 text-[11.5px] text-fg-muted ${
        warning ? "border-yellow/40 bg-yellow/10" : "border-border bg-bg-sunken"
      }`}
      data-testid="research-diagnostics-banner"
    >
      {warning ? (
        <WarningCircle className="shrink-0 text-yellow-text" size={14} weight="regular" />
      ) : (
        <Info className="shrink-0 text-fg-muted" size={14} weight="regular" />
      )}
      <div
        className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 py-0.5 leading-[1.45]"
        data-testid="research-diagnostics-content"
      >
        {children}
      </div>
      <button
        aria-label={dismissLabel}
        className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-control p-0 text-fg-muted hover:text-fg"
        onClick={onDismiss}
        type="button"
      >
        <X size={12} weight="regular" />
      </button>
    </div>
  );
}
