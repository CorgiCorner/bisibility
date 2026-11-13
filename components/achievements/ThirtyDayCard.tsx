"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import type { AchievementView } from "@/lib/achievements/schema";
import { THIRTY_DAYS_GOAL, THIRTY_DAYS_KIND } from "@/lib/achievements/thirty-days";
import {
  joinThirtyDaysChallenge,
  leaveThirtyDaysChallenge,
  shareAchievement,
} from "@/lib/actions/achievements";
import { appPath } from "@/lib/routing/app-path";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { AchievementActionsMenu } from "./AchievementActionsMenu";
import { ThirtyDayCalendar } from "./ThirtyDayCalendar";
import { ThirtyDayMark } from "./ThirtyDayMark";

const steps = [
  ["thirtyStep1Title", "thirtyStep1Body"],
  ["thirtyStep2Title", "thirtyStep2Body"],
  ["thirtyStep3Title", "thirtyStep3Body"],
] as const;

function formatDay(locale: string, day: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

export function ThirtyDayCard({
  view,
  onRefresh,
}: {
  view: AchievementView;
  onRefresh: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("account.achievements");
  const challenge = view.thirtyDays;
  const joinedOn = challenge?.joinedOn ?? null;
  const leftOn = challenge?.leftOn ?? null;
  const active = Boolean(joinedOn) && !leftOn;
  const award = view.awards.find((item) => item.kind === THIRTY_DAYS_KIND);
  const projects = view.snapshotProjects ?? [];
  const [projectId, setProjectId] = useState(projects[0]?.publicId ?? "");
  const [replay, setReplay] = useState(0);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pending, startTransition] = useTransition();

  function join() {
    startTransition(async () => {
      setError(false);
      try {
        const result = await joinThirtyDaysChallenge();
        if (result.kind === "joined" || result.kind === "already_joined") onRefresh();
        else setError(true);
      } catch {
        setError(true);
      }
    });
  }
  function leave() {
    startTransition(async () => {
      setError(false);
      try {
        const result = await leaveThirtyDaysChallenge();
        if (result.kind === "left" || result.kind === "already_left") {
          setConfirmLeave(false);
          onRefresh();
        } else setError(true);
      } catch {
        setError(true);
      }
    });
  }
  function share(published: boolean) {
    startTransition(async () => {
      setError(false);
      try {
        const result = await shareAchievement({ kind: THIRTY_DAYS_KIND, published });
        if (result.kind !== "saved") {
          setError(true);
          return;
        }
        setLink(result.token ? `${window.location.origin}/activity/badge/${result.token}` : null);
        setCopied(false);
        onRefresh();
      } catch {
        setError(true);
      }
    });
  }

  return (
    <Card
      data-achievement-card={THIRTY_DAYS_KIND}
      className="flex min-w-0 flex-col gap-5 p-5 sm:p-6"
      size="lg"
    >
      <div className="min-w-0">
        <h2 className="m-0 text-ui-section">{t("thirtyTitle")}</h2>
        <p className="mb-0 mt-1 text-ui-caption text-fg-muted">{t("thirtyDescription")}</p>
      </div>
      {joinedOn && challenge ? (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-ui-h1 tabular-nums">
                  {t("thirtyDayLabel", { day: challenge.dayNumber })}
                </p>
                <span className="text-ui-caption text-fg-muted">
                  {t("thirtyStarted", {
                    goal: THIRTY_DAYS_GOAL,
                    date: formatDay(locale, joinedOn),
                  })}
                </span>
              </div>
              <div key={replay}>
                <ThirtyDayMark />
              </div>
            </div>
            <ThirtyDayCalendar slots={challenge.slots} />
            {challenge.overflowDays > 0 ? (
              <p className="m-0 text-ui-caption text-fg-muted">
                {t("thirtyOverflow", { count: challenge.overflowDays })}
              </p>
            ) : null}
            <p className="m-0 text-ui-caption text-fg-muted">{t("thirtyPause")}</p>
            {leftOn ? (
              <p className="m-0 text-ui-caption text-fg-muted">
                {t("thirtyLeft", { date: formatDay(locale, leftOn) })}
              </p>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirmLeave(true)}
              >
                {t("thirtyLeave")}
              </Button>
            )}
          </div>
          <Guide projectId={projectId} projects={projects} onProject={setProjectId} />
        </div>
      ) : (
        <Guide projectId={projectId} projects={projects} onProject={setProjectId} />
      )}
      {!active ? (
        <div className="flex flex-col items-start gap-2">
          <Button size="sm" onClick={join} loading={pending} disabled={!view.enabled || pending}>
            {t("thirtyStart")}
          </Button>
          {!view.enabled ? (
            <p className="m-0 text-ui-caption text-fg-muted">{t("thirtyTrackingOff")}</p>
          ) : null}
        </div>
      ) : null}
      {award ? (
        <div className="space-y-3 border-t border-border-soft pt-4">
          <div className="flex items-center justify-between gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => share(!award.published)}
              loading={pending}
            >
              {t(award.published ? "revoke" : "createLink")}
            </Button>
            <AchievementActionsMenu
              size="sm"
              kind={THIRTY_DAYS_KIND}
              onReplay={() => setReplay((value) => value + 1)}
            />
          </div>
          {link ? (
            <div className="flex min-w-0 items-center gap-2 rounded-control border border-border px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-ui-caption">{link}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  } catch {
                    setError(true);
                  }
                }}
              >
                {t(copied ? "copied" : "copy")}
              </Button>
            </div>
          ) : null}
          <p className="m-0 text-ui-micro text-fg-muted">{t("publicHint")}</p>
        </div>
      ) : null}
      {error ? (
        <p className="m-0 text-ui-caption text-danger" role="alert">
          {t("thirtyError")}
        </p>
      ) : null}
      {confirmLeave ? (
        <Modal
          open
          title={t("thirtyLeaveTitle")}
          onClose={() => setConfirmLeave(false)}
          dismissDisabled={pending}
          footer={
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirmLeave(false)}
              >
                {t("thirtyCancel")}
              </Button>
              <Button size="sm" variant="destructive" loading={pending} onClick={leave}>
                {t("thirtyLeaveConfirm")}
              </Button>
            </>
          }
        >
          <p className="m-0 text-ui-body text-fg-muted">{t("thirtyLeaveBody")}</p>
        </Modal>
      ) : null}
    </Card>
  );
}

function Guide({
  projectId,
  projects,
  onProject,
}: {
  projectId: string;
  projects: Array<{ publicId: string; name: string }>;
  onProject: (value: string) => void;
}) {
  const t = useTranslations("account.achievements");
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-ui-body font-medium">{t("thirtyHow")}</p>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {steps.map(([title, body], index) => (
          <li key={title} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="grid h-5 w-5 flex-none place-items-center rounded-control bg-bg-sunken text-ui-micro font-semibold text-fg-muted"
            >
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-ui-body">{t(title)}</span>
              <span className="text-ui-caption text-fg-muted">{t(body)}</span>
            </span>
          </li>
        ))}
      </ol>
      {projects.length ? (
        <div className="flex flex-col items-start gap-2">
          <MenuSelect
            ariaLabel={t("thirtySnapshotLabel")}
            value={projectId}
            onChange={onProject}
            options={projects.map((project) => ({ value: project.publicId, label: project.name }))}
          />
          <a
            className="text-ui-caption text-accent-text underline"
            href={appPath(projectId, "pages")}
          >
            {t("thirtySnapshotOpen")}
          </a>
        </div>
      ) : (
        <p className="m-0 text-ui-caption text-fg-muted">{t("thirtySnapshotEmpty")}</p>
      )}
    </div>
  );
}
