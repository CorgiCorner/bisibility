"use client";
import { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { Button } from "@/components/ui/Button";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { useToast } from "@/components/ui/toast-context";
import { RUNS_PER_MONTH } from "@/lib/cost-estimate/estimate";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ArchiveScheduleModal } from "./ArchiveScheduleModal";
import type { ScheduleListRow } from "./SchedulesList";
import { nextRunLabel } from "./schedule-next-run";
import { requestScheduleState } from "./schedule-state-request";
import { ScheduleReviewCancelled, useScheduleSpendReview } from "./useScheduleSpendReview";

export function ScheduleDetailsSummary({
  canEdit,
  canManage,
  projectId,
  schedule,
  schedules,
}: Readonly<{
  canEdit: boolean;
  canManage: boolean;
  projectId: string;
  schedule: ScheduleListRow;
  schedules: readonly ScheduleListRow[];
}>) {
  const t = useTranslations("projectRuns.schedules");
  const locale = useLocale();
  const usage = useNativeUsageFormat();
  const router = useRouter();
  const { showToast } = useToast();
  const spendReview = useScheduleSpendReview(projectId);
  const [pending, setPending] = useState(false);
  const [archive, setArchive] = useState(false);
  const runs =
    schedule.frequency in RUNS_PER_MONTH
      ? RUNS_PER_MONTH[schedule.frequency as keyof typeof RUNS_PER_MONTH]
      : null;
  const estimate = schedule.nativeEstimate;
  const monthly =
    estimate && runs !== null && estimate.quantity !== null
      ? { ...estimate, quantity: estimate.quantity * runs }
      : null;
  const next = !schedule.enabled
    ? t("list.paused")
    : (schedule.assignedKeywordCount ?? schedule.keywordCount) === 0
      ? t("list.emptyNext")
      : schedule.blocked
        ? t("list.blocked")
        : (nextRunLabel(
            schedule.nextRunAt,
            schedule.timezone,
            locale,
            t,
            schedule.timeOfDay === null &&
              ["daily", "weekly", "monthly"].includes(schedule.frequency)
              ? schedule.frequency === "daily"
                ? "day"
                : "interval"
              : false,
          ) ?? (schedule.keywordCount === 0 ? "-" : t("summary.nextPending")));

  async function change() {
    if (pending) return;
    setPending(true);
    try {
      await spendReview.run(
        {
          op: "state",
          id: schedule.publicId,
          state: schedule.enabled ? "paused" : "active",
          command: { kind: "rank", projectPublicId: projectId },
        },
        (review) => requestScheduleState(projectId, schedule.publicId, !schedule.enabled, review),
      );
      router.refresh();
    } catch (error) {
      if (error instanceof ScheduleReviewCancelled) return;
      showToast(t("list.toggleFailed"), { severity: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {spendReview.dialog}
      <section
        aria-label={t("summary.title")}
        className="rounded-card border border-border bg-bg-elev p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="m-0 flex flex-wrap gap-x-8 gap-y-4 text-[12px]">
            {[
              [t("summary.nextRun"), next],
              [t("perRun"), estimate ? `~${usage.format(estimate)}` : "-"],
              [t("summary.perMonth"), monthly ? `~${usage.format(monthly)}` : "-"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-fg-muted">{label}</dt>
                <dd className="m-0 mt-1 font-semibold text-fg">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <Button
                disabled={pending}
                onClick={() => void change()}
                size="sm"
                type="button"
                variant="secondary"
              >
                {schedule.enabled ? t("list.pause") : t("list.resume")}
              </Button>
            ) : null}
            {canManage ? (
              <RowActionsMenu
                ariaLabel={t("lifecycle.archiveActions", { name: schedule.name })}
                items={[
                  {
                    label: t("lifecycle.archive"),
                    disabled: pending,
                    onSelect: () => setArchive(true),
                  },
                ]}
              />
            ) : null}
          </div>
        </div>
        {(schedule.assignedKeywordCount ?? schedule.keywordCount) > 0 ? (
          <p className="m-0 mt-2 text-[11.5px] text-fg-muted">{t("summary.nonEmptyDeletion")}</p>
        ) : null}
      </section>
      {archive ? (
        <ArchiveScheduleModal
          onClose={() => setArchive(false)}
          projectId={projectId}
          schedule={schedule}
          schedules={schedules}
        />
      ) : null}
    </>
  );
}
