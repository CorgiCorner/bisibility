"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IntroductionExplainer } from "@/components/ui/IntroductionExplainer";
import { useToast } from "@/components/ui/toast-context";
import { calendarDay } from "@/lib/achievements/calendar";
import { track } from "@/lib/analytics/client";
import { type ChallengeDay, challengeProgress } from "@/lib/challenge-report/challenge-window";
import type { readProjectChallenge } from "@/lib/challenge-report/project-challenge";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { useChallengeIntroSteps } from "./ChallengeIntroSteps";
import { ChallengeParticipantActions, ProjectChallengeOpened } from "./ProjectChallengeOpened";

type Challenge = NonNullable<Awaited<ReturnType<typeof readProjectChallenge>>>;

function previewProgress() {
  const today = calendarDay(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  return challengeProgress({ checkedDays: [], joinedOn: today, today });
}

/**
 * The challenge entry on Pages. Opening the challenge, its Day 1 preview and
 * Learn more never enroll or record anything; only the explicit Start does.
 */
export function ProjectChallengeCard({
  canStart,
  challenge: initialChallenge,
  mark,
  projectId,
  start,
}: Readonly<{
  canStart: boolean;
  challenge: Challenge | null;
  mark: (projectId: string, day: string) => Promise<{ ok: boolean }>;
  projectId: string;
  start: (projectId: string, timeZone: string) => Promise<Challenge | null>;
}>) {
  const t = useTranslations("challengeReport");
  const format = useFormatter();
  const router = useRouter();
  const { showToast } = useToast();
  const steps = useChallengeIntroSteps();
  const [started, setStarted] = useState<Challenge | null>(null);
  const challenge = initialChallenge ?? started;
  const [open, setOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const inFlight = useRef(false);
  const startClickedAt = useRef<number | null>(null);
  const returnFocus = useRef(false);
  const openButton = useCallback((node: HTMLButtonElement | null) => {
    if (!node || !returnFocus.current) return;
    returnFocus.current = false;
    node.focus();
  }, []);

  async function join() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    startClickedAt.current = performance.now();
    try {
      const value = await start(projectId, Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (!value) throw new Error("Challenge could not be started");
      setStarted(value);
      setIntroOpen(false);
      setOpen(true);
      track("seo_challenge_joined");
      router.refresh();
    } catch {
      startClickedAt.current = null;
      showToast(t("challengeStartFailed"), { severity: "error" });
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function markDay(day: ChallengeDay) {
    if (marking) return;
    setMarking(day.day);
    try {
      const result = await mark(projectId, day.day);
      if (!result.ok) throw new Error("Day could not be marked");
      showToast(t("calendar.marked", { index: day.index }), { severity: "success" });
      router.refresh();
    } catch {
      showToast(t("calendar.markFailed"), { severity: "error" });
    } finally {
      setMarking(null);
    }
  }

  function cardReady() {
    const clickedAt = startClickedAt.current;
    if (clickedAt === null) return;
    startClickedAt.current = null;
    track("seo_challenge_card_ready", { elapsed_ms: Math.round(performance.now() - clickedAt) });
  }

  function close() {
    startClickedAt.current = null;
    returnFocus.current = true;
    setOpen(false);
  }

  const status = challenge
    ? challenge.progress.ended
      ? t("challengeEnded", {
          count: challenge.progress.checkInCount,
          date: format.dateTime(new Date(`${challenge.progress.end}T12:00:00Z`), {
            dateStyle: "medium",
            timeZone: "UTC",
          }),
        })
      : t("challengeStatus", {
          count: challenge.progress.checkInCount,
          day: challenge.progress.elapsedDays,
        })
    : t("challengePitch");
  const startButton = (
    <Button
      loading={busy}
      loadingLabel={t("challengeStarting")}
      onClick={() => void join()}
      size="sm"
    >
      {t("challengeStart")}
    </Button>
  );
  const learnMore = (
    <Button onClick={() => setIntroOpen(true)} size="sm" variant="ghost">
      {t("intro.learnMore")}
    </Button>
  );

  return (
    <Card className="mb-6 grid min-w-0 gap-4" id="seo-challenge">
      {open ? (
        <ProjectChallengeOpened
          actions={
            <>
              {challenge ? (
                <ChallengeParticipantActions
                  ended={challenge.progress.ended}
                  projectId={projectId}
                />
              ) : canStart ? (
                startButton
              ) : null}
              {learnMore}
            </>
          }
          marking={marking}
          onCardReady={cardReady}
          onClose={close}
          onMark={challenge ? (day) => void markDay(day) : undefined}
          preview={!challenge}
          progress={challenge?.progress ?? previewProgress()}
          projectId={projectId}
          status={challenge ? status : t("preview.lead")}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="grid min-w-0 flex-[1_1_18rem] gap-1">
            <h2 className="m-0 text-ui-section">{t("journeyName")}</h2>
            <p className="m-0 text-ui-body text-fg-muted">{status}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setOpen(true)} ref={openButton} size="sm">
              {t("openChallenge")}
            </Button>
            {learnMore}
          </div>
        </div>
      )}
      <IntroductionExplainer
        footer={!challenge && canStart ? startButton : undefined}
        lead={t("intro.lead")}
        onClose={() => setIntroOpen(false)}
        open={introOpen}
        steps={steps}
        title={t("intro.title")}
      />
    </Card>
  );
}
