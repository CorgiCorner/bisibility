"use client";

import { Button } from "@/components/ui/Button";
import { PillBadge } from "@/components/ui/Pill";
import { track } from "@/lib/analytics/client";
import type { ChallengeDay, ChallengeProgress } from "@/lib/challenge-report/challenge-window";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useId } from "react";
import { ChallengeCalendar } from "./ChallengeCalendar";
import { ChallengeCompletion, CheckInRules, DayOneExercise, DayOneSample } from "./ChallengeDayOne";

/**
 * The opened challenge experience. Without an enrollment it is the Day 1
 * preview: sample content and an explicit Start, nothing saved. With one it
 * shows real progress, manual day marks and, after Day 30, the badge and report.
 */
export function ProjectChallengeOpened({
  actions,
  marking,
  onCardReady,
  onClose,
  onMark,
  preview,
  progress,
  projectId,
  status,
}: Readonly<{
  actions: ReactNode;
  marking: string | null;
  onCardReady: () => void;
  onClose: () => void;
  onMark?: (day: ChallengeDay) => void;
  preview: boolean;
  progress: ChallengeProgress;
  projectId: string;
  status: string;
}>) {
  const t = useTranslations("challengeReport");
  const headingId = useId();
  const cardUrl = appPath(projectId, "pages", "challenge-card");
  const focusOnMount = useCallback((node: HTMLElement | null) => node?.focus(), []);
  const canMarkMissed = !preview && progress.days.some((day) => day.markable);

  return (
    <section
      aria-labelledby={headingId}
      className="grid min-w-0 gap-5 outline-none"
      ref={focusOnMount}
      tabIndex={-1}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-ui-section" id={headingId}>
              {t("journeyName")}
            </h2>
            {preview ? <PillBadge>{t("preview.badge")}</PillBadge> : null}
          </div>
          <p className="m-0 text-ui-body text-fg-muted">{status}</p>
        </div>
        <Button onClick={onClose} size="sm" variant="ghost">
          {t(preview ? "hidePreview" : "hideProgress")}
        </Button>
      </div>
      <div className="grid min-w-0 gap-2">
        <ChallengeCalendar days={progress.days} marking={marking} onMark={onMark} />
        {canMarkMissed ? (
          <p className="m-0 text-ui-caption text-fg-muted">{t("calendar.hint")}</p>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-5 sm:grid-cols-2 sm:items-start sm:gap-6">
        {preview ? (
          <DayOneSample />
        ) : (
          // biome-ignore lint/performance/noImgElement: the private card is an authenticated, no-store PNG.
          <img
            alt={t("dayOneCard")}
            className="h-auto w-full rounded-control"
            height={630}
            onLoad={onCardReady}
            src={cardUrl}
            width={1200}
          />
        )}
        <div className="grid min-w-0 gap-5">
          {preview || progress.elapsedDays === 1 ? <DayOneExercise /> : null}
          <CheckInRules />
        </div>
      </div>
      {!progress.ended ? <ChallengeCompletion /> : null}
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </section>
  );
}

/** Participant actions: the Day 1 card always, the badge and report after Day 30. */
export function ChallengeParticipantActions({
  ended,
  projectId,
}: Readonly<{ ended: boolean; projectId: string }>) {
  const t = useTranslations("challengeReport");
  const cardUrl = appPath(projectId, "pages", "challenge-card");
  return (
    <>
      {ended ? (
        <Button href={`${appPath(projectId, "agent-reports")}?compose=challenge`} size="sm">
          {t("journeyCreate")}
        </Button>
      ) : null}
      <Button
        href={`${cardUrl}?download=1`}
        onClick={() => track("seo_challenge_card_download_clicked")}
        size="sm"
        variant={ended ? "secondary" : "primary"}
      >
        {t("downloadDayOne")}
      </Button>
      {ended ? (
        <Button href={`${cardUrl}?badge=1&download=1`} size="sm" variant="secondary">
          {t("downloadBadge")}
        </Button>
      ) : null}
    </>
  );
}
