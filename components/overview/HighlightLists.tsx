"use client";

import { MarketChip } from "@/components/markets/MarketChip";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tooltip } from "@/components/ui/Tooltip";
import { appPath } from "@/lib/routing/app-path";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { HighlightList, HighlightNote, HighlightRow, RelativeTime } from "./types";

export type HighlightListsProps = {
  lists: HighlightList[];
  projectRef: string;
  rowHref?: (row: HighlightRow) => string;
};

type HighlightTranslations = ReturnType<typeof useTranslations<"projectDashboard.highlights">>;

const positionToneClassName = {
  danger: "text-red-text",
  default: "text-fg",
  muted: "text-fg-muted",
} satisfies Record<NonNullable<HighlightRow["positionTone"]>, string>;

function relativeTimeCopy(t: HighlightTranslations, age: RelativeTime) {
  if (age.kind === "justNow") return t("relativeJustNow");
  if (age.kind === "yesterday") return t("relativeYesterday");
  if ("value" in age && age.kind === "minutes") {
    return t("relativeMinutes", { value: age.value });
  }
  if ("value" in age && age.kind === "hours") {
    return t("relativeHours", { value: age.value });
  }
  if ("value" in age) return t("relativeDays", { value: age.value });
  return t("relativeJustNow");
}

export function highlightNoteCopy(t: HighlightTranslations, note: HighlightNote) {
  const noRankingUrl = t("noRankingUrl");
  if (note.kind === "rankingUrl") return note.url ?? noRankingUrl;
  if (note.kind === "movement") {
    return t(note.direction === "gained" ? "gained" : "dropped", {
      url: note.url ?? noRankingUrl,
      value: note.value,
    });
  }
  if (note.kind === "coverageUnknown") return t("coverageUnknown");
  if (note.kind === "latestCheckFailed") return t("latestCheckFailed");
  if (note.kind === "latestCheckNotRanked") return t("latestCheckNotRanked");
  if (note.kind === "enteredTop10") return t("enteredTop10", { url: note.url ?? noRankingUrl });
  const age = relativeTimeCopy(t, note.age);
  if (note.checkState === "firstCheckPending") {
    return t("recentlyAddedFirstCheckPending", { age });
  }
  if (note.checkState === "notRanked") return t("recentlyAddedNotRanked", { age });
  return t("recentlyAddedRankingUrl", { age, url: note.url ?? noRankingUrl });
}

export function highlightPositionCopy(t: HighlightTranslations, row: HighlightRow) {
  if (row.positionState === "noData") return t("noData");
  if (row.positionState === "notRanked") return t("notRanked");
  if (row.positionState === "awaitingFirstCheck") return t("awaitingFirstCheck");
  if (row.position !== null) return t("position", { value: row.position });
  return t("noData");
}

function listCopy(t: HighlightTranslations, kind: HighlightList["kind"]) {
  if (kind === "wins") {
    return {
      empty: { description: t("emptyWinsDescription"), title: t("emptyWinsTitle") },
      subtitle: t("winsDescription"),
      title: t("winsTitle"),
    };
  }
  if (kind === "attention") {
    return {
      empty: { description: t("emptyAttentionDescription"), title: t("emptyAttentionTitle") },
      subtitle: t("attentionDescription"),
      title: t("attentionTitle"),
    };
  }
  if (kind === "newTop10") {
    return {
      empty: { description: t("emptyNewTop10Description"), title: t("emptyNoMatchesTitle") },
      subtitle: t("newTop10Description"),
      title: t("newTop10Title"),
    };
  }
  return {
    empty: { description: t("emptyRecentlyAddedDescription"), title: t("emptyNoMatchesTitle") },
    subtitle: t("recentlyAddedDescription"),
    title: t("recentlyAddedTitle"),
  };
}

function Delta({ row }: Readonly<{ row: HighlightRow }>) {
  const t = useTranslations("projectDashboard.highlights");
  if (!row.delta) return null;
  const Icon = row.delta.direction === "up" ? ArrowUp : ArrowDown;
  const colorClassName = row.delta.direction === "up" ? "text-green-text" : "text-red-text";
  return (
    <Tooltip
      content={t(row.delta.direction === "up" ? "deltaUp" : "deltaDown", {
        value: row.delta.value,
      })}
    >
      <span
        className={`inline-flex items-center gap-0.5 font-sans tabular-nums text-[11px] font-semibold ${colorClassName}`}
      >
        <Icon aria-hidden size={12} weight="regular" />
        {t("deltaValue", { value: row.delta.value })}
      </span>
    </Tooltip>
  );
}

function MarketIdentity({ row }: Readonly<{ row: HighlightRow }>) {
  if (!row.marketLocationLabel || !row.marketLanguageLabel) return null;
  return (
    <span className="mt-1.5 flex min-w-0 items-center">
      <MarketChip
        className="max-w-[208px]"
        countryCode={row.marketCountryCode}
        device={row.device === "mobile" || row.device === "desktop" ? row.device : null}
        languageCode={row.marketLanguageCode}
        languageLabel={row.marketLanguageLabel}
        locationLabel={row.marketLocationLabel}
      />
    </span>
  );
}

export function HighlightLists({ lists, projectRef, rowHref }: Readonly<HighlightListsProps>) {
  const t = useTranslations("projectDashboard.highlights");
  if (lists.length === 0) return null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
      {lists.map((list) => {
        const copy = listCopy(t, list.kind);
        return (
          <Card className="flex min-w-0 flex-col overflow-hidden p-0" key={list.kind} size="md">
            <div className="flex-none px-4.5 pb-3 pt-[15px]">
              <div className="flex items-center text-sm font-semibold text-fg">{copy.title}</div>
              <span className="mt-[3px] block min-h-[2lh]">{copy.subtitle}</span>
            </div>
            <div className="flex flex-1 flex-col">
              {list.rows.length === 0 ? (
                <div className="grid flex-1 place-items-center border-t border-border p-3">
                  <EmptyState compact {...copy.empty} />
                </div>
              ) : (
                list.rows.map((row) => (
                  <Link
                    className="flex min-h-[68px] items-center justify-between gap-2.5 border-t border-border px-4.5 py-2.5 hover:bg-bg-sunken"
                    href={rowHref?.(row) ?? appPath(projectRef, "rank-tracker", row.id)}
                    key={row.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-fg">
                        {row.keyword}
                      </span>
                      <MarketIdentity row={row} />
                      <span className="mt-2 block truncate font-sans tabular-nums text-[10.5px] text-fg-muted">
                        {highlightNoteCopy(t, row.note)}
                      </span>
                    </span>
                    <span className="inline-flex flex-none items-center gap-2">
                      <span
                        className={`font-sans tabular-nums text-[13px] font-semibold ${
                          positionToneClassName[row.positionTone ?? "default"]
                        }`}
                      >
                        {highlightPositionCopy(t, row)}
                      </span>
                      <Delta row={row} />
                    </span>
                  </Link>
                ))
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
