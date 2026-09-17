import {
  itemStatusChipPresentation,
  runStatusChipPresentation,
} from "@/components/ui/status-chip-mapping";
import { type DateDisplayContext, formatDisplayDateTimeCurrentYear } from "@/lib/dates/format";
import type { useTranslations } from "next-intl";
import type { RunPageSummaryLabels } from "./RunPageModel";
import type { RunPageData } from "./RunPageTypes";

type RankRunsTranslator = ReturnType<typeof useTranslations<"projectRuns.rankRuns">>;
type StatusTranslator = ReturnType<typeof useTranslations<"shared.controls.status">>;

function relativeShort(iso: string | null, now: string, t: RankRunsTranslator) {
  if (!iso) return t("relative.notScheduled");
  const minutes = Math.ceil((new Date(iso).getTime() - new Date(now).getTime()) / 60_000);
  if (minutes <= 0) return t("relative.dueNow");
  if (minutes < 60) return t("relative.shortMinutes", { count: minutes });
  if (minutes < 1_440) return t("relative.shortHours", { count: Math.ceil(minutes / 60) });
  return t("relative.shortDays", { count: Math.ceil(minutes / 1_440) });
}

function elapsedValue(
  startedAt: string | null,
  finishedAt: string | null,
  now: string,
  t: RankRunsTranslator,
) {
  if (!startedAt) return t("unavailable");
  const seconds = Math.max(
    0,
    Math.floor((new Date(finishedAt ?? now).getTime() - new Date(startedAt).getTime()) / 1_000),
  );
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return t("elapsedValue", { hours, minutes, seconds: seconds % 60 });
}

export function createRunPageSummaryLabels({
  currentRun,
  dateDisplay,
  locale,
  now,
  statusT,
  t,
}: Readonly<{
  currentRun: RunPageData;
  dateDisplay: DateDisplayContext;
  locale: string;
  now: string;
  statusT: StatusTranslator;
  t: RankRunsTranslator;
}>): RunPageSummaryLabels {
  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat(locale, { currency: "USD", style: "currency" }).format(cents / 100);
  return {
    counter: (kind) => {
      if (kind === "remaining") return { label: t("remaining"), note: t("counters.notTerminal") };
      const presentation = itemStatusChipPresentation(kind);
      const note =
        kind === "completed"
          ? t("counters.completedNote")
          : kind === "failed"
            ? t("counters.failedNote")
            : kind === "deferred"
              ? t("counters.deferredNote")
              : t("counters.cancelledNote");
      return { label: statusT(presentation.messageKey), note };
    },
    elapsed: (startedAt, finishedAt, currentNow) =>
      elapsedValue(startedAt, finishedAt, currentNow, t),
    fact: (fact) => {
      if (fact.kind === "selection") {
        return {
          label: t("facts.selection"),
          note: "",
          value: t("keywordsAndTargets", {
            keywords: fact.keywordCount,
            targets: fact.targetCount,
          }),
        };
      }
      if (fact.kind === "provider") {
        return {
          label: t("provider"),
          note: fact.state === "not_chosen" ? t("facts.notChosen") : t("facts.chosenAtLaunch"),
          value: fact.providerLabel ?? t("unavailable"),
        };
      }
      if (fact.kind === "cost") {
        const label =
          fact.phase === "estimated"
            ? t("facts.estimated")
            : fact.phase === "spent"
              ? t("facts.spent")
              : t("facts.cost");
        const note =
          fact.note === "nothing_billed"
            ? t("facts.nothingBilled")
            : fact.note === "no_rate_yet"
              ? t("facts.noRateYet")
              : fact.note === "set_when_planned"
                ? t("facts.setWhenPlanned")
                : t("facts.estimateWithCost", {
                    cost: formatCurrency(currentRun.estimatedCostCents),
                  });
        return {
          label,
          note,
          value: fact.costCents === null ? t("unavailable") : formatCurrency(fact.costCents),
        };
      }
      if (fact.kind === "first_check") {
        const scheduleTiming =
          fact.note === "schedule_timing" && fact.scheduleTiming
            ? fact.scheduleTiming.kind === "spread_across_day"
              ? t("facts.spreadAcrossDay")
              : fact.scheduleTiming.kind === "spread_across_interval"
                ? t("facts.spreadAcrossInterval")
                : fact.scheduleTiming.kind === "starts_within_minutes"
                  ? t("facts.startsWithinMinutes", { count: fact.scheduleTiming.minutes })
                  : t("facts.startsAtScheduledTime")
            : null;
        return {
          label: t("facts.firstCheck"),
          note:
            fact.note === "schedule_timing"
              ? (scheduleTiming ?? t("facts.scheduledOccurrence"))
              : fact.note === "waiting_for_worker"
                ? t("facts.waitingForWorker")
                : t("facts.waitingToStart"),
          value: relativeShort(fact.nextAt, now, t),
        };
      }
      const label =
        fact.phase === "blocked_since"
          ? t("facts.blockedSince")
          : fact.phase === "starts_in"
            ? t("facts.startsIn")
            : fact.phase === "elapsed"
              ? t("facts.elapsed")
              : t("duration");
      const note =
        fact.note === "waiting_to_start"
          ? t("facts.waitingToStart")
          : fact.note === "scheduled_occurrence"
            ? t("facts.scheduledOccurrence")
            : fact.note === "not_started"
              ? t("notStarted")
              : fact.note === "not_finished"
                ? t("facts.notFinished")
                : fact.note === "started" && fact.value.kind === "duration" && fact.value.startedAt
                  ? t("facts.started", {
                      time: formatDisplayDateTimeCurrentYear(
                        new Date(fact.value.startedAt),
                        new Date(fact.now),
                        dateDisplay,
                      ),
                    })
                  : fact.value.kind === "instant" && fact.value.value
                    ? t("facts.started", {
                        time: formatDisplayDateTimeCurrentYear(
                          new Date(fact.value.value),
                          new Date(fact.now),
                          dateDisplay,
                        ),
                      })
                    : "";
      const value =
        fact.value.kind === "duration"
          ? fact.phase === "elapsed" || fact.phase === "duration"
            ? elapsedValue(fact.value.startedAt, fact.value.finishedAt, fact.now, t)
            : t("unavailable")
          : fact.value.value
            ? formatDisplayDateTimeCurrentYear(
                new Date(fact.value.value),
                new Date(fact.now),
                dateDisplay,
              )
            : t("notStarted");
      return { label, note, value };
    },
    matched: (started, total) => t("summary.matched", { started, total }),
    progress: (processed, total) => t("summary.processed", { processed, total }),
    runPresentation: (run, skipped) => {
      if (skipped) return { label: statusT("skipped"), messageKey: "skipped", tone: "neutral" };
      const presentation = runStatusChipPresentation(run.status, run.outcome);
      return { ...presentation, label: statusT(presentation.messageKey) };
    },
    selected: (count) => t("summary.selected", { count }),
    skippedBy: (name, date) =>
      t("summary.skippedBy", {
        date: date
          ? formatDisplayDateTimeCurrentYear(new Date(date), new Date(now), dateDisplay)
          : t("unknownDate"),
        name: name || t("aTeamMember"),
      }),
    skippedExplanation: () => t("summary.skippedExplanation"),
  };
}
