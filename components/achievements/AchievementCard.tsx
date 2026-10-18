"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { BadgeKind } from "@/lib/achievements/progress";
import type { AchievementView } from "@/lib/achievements/schema";
import { shareAchievement } from "@/lib/actions/achievements";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { AchievementActionsMenu } from "./AchievementActionsMenu";
import { ActivityDays } from "./ActivityDays";
import styles from "./achievements.module.css";
import { BadgeArt } from "./BadgeArt";
export function AchievementCard({
  view,
  kind,
  onRefresh,
}: {
  view: AchievementView;
  kind: BadgeKind;
  onRefresh: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("account.achievements"),
    progress = view[kind];
  const award = view.awards.find((a) => a.kind === kind);
  const [replay, setReplay] = useState(0),
    [link, setLink] = useState<string | null>(null),
    [copied, setCopied] = useState(false),
    [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  function share(published: boolean) {
    startTransition(async () => {
      setError(false);
      try {
        const result = await shareAchievement({ kind, published });
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
      data-achievement-card={kind}
      className={`${styles.card} ${kind === "presence" ? styles.presence : styles.practice} flex min-w-0 flex-col gap-6 p-5 sm:p-6`}
      size="lg"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="m-0 text-[15px] font-semibold leading-6">
            {t(kind === "presence" ? "presenceTitle" : "practiceTitle")}
          </h2>
          <p className="mb-0 mt-2 text-[12px] leading-5 text-fg-muted xl:min-h-15">
            {t(kind === "presence" ? "presenceDescription" : "practiceDescription")}
          </p>
          <p className="mb-0 mt-4 text-[30px] font-semibold leading-9 tracking-tight tabular-nums">
            {t("days", { count: progress.current })}
          </p>
        </div>
        <div className={award ? styles.award : undefined} key={replay}>
          <BadgeArt kind={kind} locked={!award} />
        </div>
      </div>
      <div className="flex flex-col gap-3" data-activity-calendar>
        <ActivityDays today={view.today} days={progress.days} />
        <div className="flex items-center justify-between gap-3 text-[12px] text-fg-muted">
          <span>{t("longest", { count: String(progress.longest) })}</span>
          <span>
            {award
              ? t("earned", {
                  date: new Intl.DateTimeFormat(locale, {
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${award.earnedDay}T12:00:00Z`)),
                })
              : t("milestone", { count: String(Math.min(7, progress.current)) })}
          </span>
        </div>
      </div>
      {award ? (
        <div className="space-y-3 border-t border-border-soft pt-4">
          <div className="flex items-center justify-between gap-3">
            <Button
              size="xs"
              variant="outline"
              onClick={() => share(!award.published)}
              loading={pending}
            >
              {t(award.published ? "revoke" : "createLink")}
            </Button>
            <AchievementActionsMenu kind={kind} onReplay={() => setReplay((v) => v + 1)} />
          </div>
          {link ? (
            <div className="flex min-w-0 items-center gap-2 rounded-control border border-border px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[12px]">{link}</span>
              <Button
                size="xs"
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
          <p className="m-0 text-[11px] leading-5 text-fg-muted">{t("publicHint")}</p>
        </div>
      ) : null}
      {error ? (
        <p className="text-[12px] text-danger" role="alert">
          {t("shareError")}
        </p>
      ) : null}
    </Card>
  );
}
