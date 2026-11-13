"use client";

import { iconWellClassName } from "@/components/ui/icon-well-styles";
import { cn } from "@/lib/ui/cn";
import { CameraIcon } from "@phosphor-icons/react/dist/csr/Camera";
import { CrosshairIcon } from "@phosphor-icons/react/dist/csr/Crosshair";
import { MedalIcon } from "@phosphor-icons/react/dist/csr/Medal";
import { NotePencilIcon } from "@phosphor-icons/react/dist/csr/NotePencil";
import { useTranslations } from "next-intl";

/** The Day 1 exercise. It only explains steps; it never saves or records anything. */
export function DayOneExercise() {
  const t = useTranslations("challengeReport.dayOneSteps");
  const steps = [
    { Icon: CrosshairIcon, body: t("pickBody"), title: t("pickTitle") },
    { Icon: CameraIcon, body: t("captureBody"), title: t("captureTitle") },
    { Icon: NotePencilIcon, body: t("noteBody"), title: t("noteTitle") },
  ];
  return (
    <section className="grid min-w-0 gap-3" aria-labelledby="challenge-day-one-title">
      <h3 className="m-0 text-ui-body font-semibold" id="challenge-day-one-title">
        {t("title")}
      </h3>
      <ol className="m-0 grid list-none gap-3 p-0">
        {steps.map(({ Icon, body, title }) => (
          <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5" key={title}>
            <span
              aria-hidden
              className={cn(
                "row-span-2 flex size-7 items-center justify-center rounded-control",
                iconWellClassName,
              )}
            >
              <Icon size={15} weight="regular" />
            </span>
            <span className="text-ui-body font-medium text-fg">{title}</span>
            <span className="text-ui-caption text-fg-muted">{body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A concrete example of what someone might work on during the challenge. */
export function DayOneSample() {
  const t = useTranslations("challengeReport.preview");
  return (
    <figure className="m-0 grid min-w-0 content-start gap-3 rounded-card border border-border-soft bg-bg-sunken p-4">
      <figcaption className="text-ui-body font-semibold text-fg">{t("sample")}</figcaption>
      <dl className="m-0 grid gap-3">
        <div className="grid gap-1">
          <dt className="text-ui-caption text-fg-muted">{t("sampleFocusLabel")}</dt>
          <dd className="m-0 text-ui-body">{t("sampleFocus")}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-ui-caption text-fg-muted">{t("sampleActionLabel")}</dt>
          <dd className="m-0 text-ui-body">{t("sampleAction")}</dd>
        </div>
      </dl>
    </figure>
  );
}

export function CheckInRules() {
  const t = useTranslations("challengeReport.checkIn");
  return (
    <section className="grid min-w-0 gap-3" aria-labelledby="challenge-check-in-title">
      <h3 className="m-0 text-ui-body font-semibold" id="challenge-check-in-title">
        {t("title")}
      </h3>
      <ul className="m-0 grid list-disc gap-3 pl-5 text-ui-caption text-fg-muted marker:text-fg-muted">
        <li>{t("visit")}</li>
        <li>{t("manual")}</li>
      </ul>
    </section>
  );
}

export function ChallengeCompletion() {
  const t = useTranslations("challengeReport.checkIn");
  return (
    <section
      aria-labelledby="challenge-completion-title"
      className="flex min-w-0 items-start gap-3 rounded-card bg-accent-soft p-4"
    >
      <MedalIcon
        aria-hidden
        className="mt-0.5 shrink-0 text-accent-text"
        size={21}
        weight="regular"
      />
      <div className="grid min-w-0 gap-1">
        <h3 className="m-0 text-ui-body font-semibold" id="challenge-completion-title">
          {t("endTitle")}
        </h3>
        <p className="m-0 text-ui-caption text-fg-muted">{t("end")}</p>
      </div>
    </section>
  );
}
