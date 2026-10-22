"use client";
import { LocalReportCard } from "@/components/local-reports/LocalReportCard";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Popup } from "@/components/ui/Popup";
import { Tooltip } from "@/components/ui/Tooltip";
import { toolbarControlClassName } from "@/components/ui/toolbar-control-styles";
import { rankTrackerAsOfFormSchema } from "@/lib/keywords/rank-tracker-as-of-input";
import {
  rankTrackerNavigationHref,
  resetRankTrackerPage,
} from "@/lib/keywords/rank-tracker-navigation";
import type {
  RankTrackerQueryField,
  RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import {
  rankTrackerComparisonDays,
  rankTrackerScope,
} from "@/lib/keywords/rank-tracker-report-scope";
import type { RankTrackerLocalPresentation } from "@/lib/queries/rank-tracker-local-model";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarBlankIcon } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

const clockOptions = (count: number) =>
  Array.from({ length: count }, (_, value) => {
    const label = String(value).padStart(2, "0");
    return { value: label, label };
  });
const hours = clockOptions(24),
  minutes = clockOptions(60);
/** Display changes only navigate a validated query; no provider, business mutation or schedule port is present. */
export function RankTrackerReportScopeControl({
  query,
  basePath,
  local,
  localSetupHref,
}: {
  query: RankTrackerQueryState;
  basePath: string;
  local?: RankTrackerLocalPresentation;
  /** Project-level settings URL supplied by the authorized page, independent of a market route. */
  localSetupHref?: string;
}) {
  const t = useTranslations("projectRankTracker.reportScope"),
    format = useFormatter();
  const router = useRouter(),
    params = useSearchParams(),
    scope = rankTrackerScope(query);
  const [timeAnchor, setTimeAnchor] = useState<HTMLElement | null>(null);
  const form = useForm({
    values: { date: scope.asOf?.slice(0, 16) ?? "" },
    resolver: zodResolver(rankTrackerAsOfFormSchema),
  });
  const snapshotLabel = scope.asOf
    ? format.dateTime(new Date(scope.asOf), {
        dateStyle: "short",
        timeStyle: "short",
        hourCycle: "h23",
        timeZone: "UTC",
      })
    : t("latest");
  function closeTime() {
    form.reset({ date: scope.asOf?.slice(0, 16) ?? "" });
    setTimeAnchor(null);
  }
  const draft = form.watch("date");
  const day = draft.slice(0, 10),
    hour = draft.slice(11, 13) || "00",
    minute = draft.slice(14, 16) || "00";
  function changeTime(part: "day" | "hour" | "minute", value: string) {
    const selectedDay = part === "day" ? value : day || new Date().toISOString().slice(0, 10);
    const selectedHour = part === "hour" ? value : hour;
    const selectedMinute = part === "minute" ? value : minute;
    form.setValue("date", `${selectedDay}T${selectedHour}:${selectedMinute}`, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  function go(patch: Partial<typeof scope>, present: RankTrackerQueryField[]) {
    router.push(
      rankTrackerNavigationHref({
        basePath,
        current: params,
        present: [...present, "page"],
        query: resetRankTrackerPage({ ...query, reportScope: { ...scope, ...patch } }),
      }),
    );
  }
  return (
    <section aria-label={t("title")} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <MenuSelect
          ariaLabel={t("view")}
          value={scope.view}
          options={[
            { value: "general", label: t("general") },
            { value: "local", label: t("local") },
          ]}
          onChange={(view) => {
            if (view === "general" || view === "local") go({ view }, ["reportView"]);
          }}
        />
        {scope.view === "local" ? (
          <MenuSelect
            ariaLabel={t("subject")}
            value={JSON.stringify(scope.subject)}
            searchable
            options={[
              { value: "null", label: t("chooseSubject") },
              ...(local?.context.choices ?? []).map((choice) => ({
                value: JSON.stringify(choice.selection),
                label: choice.label,
              })),
            ]}
            onChange={(value) => {
              const choice = local?.context.choices.find(
                (item) => JSON.stringify(item.selection) === value,
              );
              if (value === "null" || choice)
                go({ subject: choice?.selection ?? null }, ["localSubject"]);
            }}
          />
        ) : null}
        <MenuSelect
          ariaLabel={t("period")}
          triggerTitle={t("comparisonHelp", { days: format.number(scope.comparisonDays) })}
          leadingLabel={t("comparisonLabel")}
          value={String(scope.comparisonDays)}
          options={rankTrackerComparisonDays.map((days) => ({
            value: String(days),
            label: t("days", { days: format.number(days) }),
          }))}
          onChange={(value) => {
            const days = rankTrackerComparisonDays.find((days) => String(days) === value);
            if (days) go({ comparisonDays: days }, ["comparisonDays"]);
          }}
        />
        <Tooltip
          content={
            scope.view === "local" ? `${t("membership")} ${t("localScope")}` : t("membership")
          }
          semantics="description"
          placement="top"
          disabled={Boolean(timeAnchor)}
        >
          <Button
            size="sm"
            variant="outline"
            className={`${toolbarControlClassName} h-8.5 px-2.5`}
            style={{ fontWeight: 400 }}
            aria-label={`${t("asOfUtc")}: ${snapshotLabel}`}
            aria-haspopup="dialog"
            aria-expanded={Boolean(timeAnchor)}
            startIcon={<CalendarBlankIcon weight="regular" aria-hidden size={15} />}
            onClick={(event) => {
              form.reset({ date: scope.asOf?.slice(0, 16) ?? "" });
              setTimeAnchor(event.currentTarget);
            }}
          >
            {snapshotLabel}
          </Button>
        </Tooltip>
      </div>
      <Popup
        anchorEl={timeAnchor}
        open={Boolean(timeAnchor)}
        onClose={closeTime}
        restoreFocus
        contentProps={{
          "aria-label": t("asOfUtc"),
          className: "w-80 max-w-[calc(100vw-32px)] p-3",
        }}
      >
        <form
          className="grid gap-3"
          onSubmit={form.handleSubmit(({ date }) => {
            go({ asOf: date ? new Date(`${date}:00.000Z`).toISOString() : null }, ["asOf"]);
            closeTime();
          })}
        >
          <p className="m-0 text-[12.5px] font-medium text-fg">{t("asOfUtc")}</p>
          <input type="hidden" {...form.register("date")} />
          <Calendar
            value={day || undefined}
            min="1970-01-01"
            max={new Date().toISOString().slice(0, 10)}
            onChange={(value) => changeTime("day", value)}
          />
          <div className="flex items-center gap-2">
            <MenuSelect
              ariaLabel={t("hour")}
              leadingLabel={t("hour")}
              value={hour}
              options={hours}
              compact
              ariaInvalid={Boolean(form.formState.errors.date)}
              onChange={(value) => changeTime("hour", value)}
            />
            <span aria-hidden className="text-fg-muted">
              :
            </span>
            <MenuSelect
              ariaLabel={t("minute")}
              leadingLabel={t("minute")}
              value={minute}
              options={minutes}
              compact
              ariaInvalid={Boolean(form.formState.errors.date)}
              onChange={(value) => changeTime("minute", value)}
            />
          </div>
          {form.formState.errors.date ? (
            <p role="alert" className="text-[12px] text-red-text">
              {t("invalidTime")}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button size="sm" type="submit" variant="outline">
              {t("applyTime")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                go({ asOf: null }, ["asOf"]);
                closeTime();
              }}
            >
              {t("latest")}
            </Button>
          </div>
        </form>
      </Popup>
      {scope.view === "local" ? (
        <>
          {local?.context.state !== "ready" ? (
            <>
              <p role="status">{t(`state.${local?.context.state ?? "missing"}`)}</p>
              {localSetupHref ? (
                <Button href={localSetupHref} variant="outline" className="justify-self-start">
                  {t("setupBusiness")}
                </Button>
              ) : null}
            </>
          ) : null}
          {local?.unsupportedFilters ? <p role="status">{t("unsupportedFilters")}</p> : null}
          {local?.summary ? (
            <LocalReportCard namespace="projectRankTracker.localSummary" report={local.summary} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
