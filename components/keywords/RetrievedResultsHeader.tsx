"use client";

import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { StoredResultsIndexEntry } from "@/lib/checks/contract";
import type { KeywordRow } from "@/lib/queries/keywords";
import { ClockCounterClockwiseIcon as History } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import { KeywordCheckScope } from "./KeywordCheckScope";
import { RetrievedResultsPicker } from "./RetrievedResultsPicker";

type Props = {
  keyword?: Pick<KeywordRow, "location" | "device" | "engine">;
  compareFrom: string;
  entries: readonly StoredResultsIndexEntry[];
  formatDate: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  mode: "one" | "compare";
  compareEnabled: boolean;
  onMode: (mode: "one" | "compare") => void;
  onSelectFrom: (id: string) => void;
  onSelectTo: (id: string) => void;
  selected: string;
};

export function RetrievedResultsHeader(props: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const comparing = props.mode === "compare";
  return (
    <header className="border-b border-border" data-testid="retrieved-header">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="m-0 text-[17px] font-semibold leading-6 text-fg">
              {comparing ? t("snapshots") : t("snapshot")}
            </h2>
            <InfoTooltip text={t("titleTip")} />
          </div>
          {props.keyword ? (
            <div className="mt-2">
              <KeywordCheckScope keyword={props.keyword} />
            </div>
          ) : null}
          <p className="m-0 mt-2 text-[12.5px] leading-5 text-fg-muted">{t("description")}</p>
        </div>
        <div
          className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end"
          data-testid="retrieved-picker-slots"
        >
          {comparing ? (
            <div className="flex min-w-0 items-center gap-2 [&>button]:min-w-0">
              <span className="text-[11px] text-fg-muted">{t("from")}</span>
              <RetrievedResultsPicker
                ariaLabel={t("earlierCheck")}
                entries={props.entries}
                formatDate={props.formatDate}
                formatDateTime={props.formatDateTime}
                onChange={props.onSelectFrom}
                pickerRole="from"
                selectedTo={props.selected}
                value={props.compareFrom}
              />
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-2 [&>button]:min-w-0">
            {comparing ? <span className="text-[11px] text-fg-muted">{t("to")}</span> : null}
            <RetrievedResultsPicker
              ariaLabel={t(comparing ? "laterCheck" : "storedChecks")}
              entries={props.entries}
              formatDate={props.formatDate}
              formatDateTime={props.formatDateTime}
              leadingIcon={
                comparing ? undefined : <History aria-hidden size={14} weight="regular" />
              }
              onChange={props.onSelectTo}
              pickerRole={comparing ? "to" : "one"}
              selectedFrom={comparing ? props.compareFrom : undefined}
              value={props.selected}
            />
          </div>
          <Button
            aria-label={comparing ? t("stopComparing") : undefined}
            aria-description={!props.compareEnabled ? t("needTwo") : undefined}
            title={!props.compareEnabled ? t("needTwo") : undefined}
            className="min-w-0"
            disabled={!comparing && !props.compareEnabled}
            onClick={() => props.onMode(comparing ? "one" : "compare")}
            size="xs"
            variant="ghost"
          >
            {comparing ? <XIcon weight="regular" aria-hidden size={16} /> : t("compareAction")}
          </Button>
        </div>
      </div>
    </header>
  );
}
