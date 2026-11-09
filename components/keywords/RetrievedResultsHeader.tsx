"use client";

import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { StoredResultsIndexEntry } from "@/lib/checks/contract";
import type { KeywordRow } from "@/lib/queries/keywords";
import { ClockCounterClockwiseIcon as History } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import { RetrievedResultsPicker } from "./RetrievedResultsPicker";

type Props = {
  sectionToggle?: React.ReactNode;
  sectionOpen?: boolean;
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
    <header
      className={props.sectionOpen === false ? "" : "border-b border-border"}
      data-testid="retrieved-header"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-x-4 gap-y-3 px-4 py-4 sm:flex sm:justify-between sm:px-5">
        <div className="col-span-2 col-start-1 row-start-1 min-w-0 pr-20 sm:pr-0">
          <div className="flex items-center gap-2">
            <SectionTitle>{comparing ? t("snapshots") : t("snapshot")}</SectionTitle>
            <InfoTooltip text={`${t("titleTip")} ${t("description")}`} />
          </div>
          <p className="m-0 mt-1 text-xs text-fg-muted">{t("snapshotSubtitle")}</p>
        </div>
        <div
          className="contents sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:justify-end sm:gap-4"
          data-testid="retrieved-picker-slots"
        >
          <Button
            aria-label={comparing ? t("stopComparing") : undefined}
            aria-description={!props.compareEnabled ? t("needTwo") : undefined}
            title={!props.compareEnabled ? t("needTwo") : undefined}
            className="col-span-2 col-start-1 row-start-1 min-h-9 min-w-0 self-start justify-self-end sm:self-auto"
            disabled={!comparing && !props.compareEnabled}
            onClick={() => props.onMode(comparing ? "one" : "compare")}
            size="xs"
            variant="outline"
          >
            {comparing ? <XIcon weight="regular" aria-hidden size={16} /> : t("compareAction")}
          </Button>
          {comparing ? (
            <div className="col-span-2 col-start-1 row-start-2 flex min-w-0 items-center gap-2 sm:w-auto">
              <span className="text-[11px] text-fg-muted">{t("from")}</span>
              <div className="min-w-0 flex-1">
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
            </div>
          ) : null}
          <div
            className={`col-start-1 flex min-w-0 items-center gap-2 sm:w-auto ${comparing ? "row-start-3" : "row-start-2"}`}
          >
            {comparing ? <span className="text-[11px] text-fg-muted">{t("to")}</span> : null}
            <div className="min-w-0 flex-1">
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
          </div>
          <div
            className={`col-start-2 justify-self-end ${comparing ? "row-start-3" : "row-start-2"}`}
          >
            {props.sectionToggle}
          </div>
        </div>
      </div>
    </header>
  );
}
