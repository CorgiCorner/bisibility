"use client";

import { Avatar } from "@/components/ui/Avatar";
import { PillBadge } from "@/components/ui/Pill";
import { useLiveNow } from "@/components/ui/useLiveNow";
import { useTranslations } from "next-intl";
import { isSkippedOccurrence } from "./runs-format";
import type { RankRunRecord } from "./runs-types";

type RankRunsTranslator = ReturnType<typeof useTranslations<"projectRuns.rankRuns">>;

export function launchedBy(run: RankRunRecord, t: RankRunsTranslator) {
  if (run.requestedBy?.name) return run.requestedBy.name;
  return run.trigger === "scheduled"
    ? (run.checkScheduleName ?? t("scheduleActor"))
    : run.trigger === "api"
      ? t("api")
      : t("you");
}

export function RunActor({ run }: Readonly<{ run: RankRunRecord }>) {
  const t = useTranslations("projectRuns.rankRuns");
  const skipped = isSkippedOccurrence(run);
  if (!run.requestedBy?.name) {
    return (
      <span className="block" data-testid={`run-actor-${run.id}`}>
        <span className="flex flex-wrap items-center gap-1.5">
          {launchedBy(run, t)}{" "}
          {run.checkScheduleArchived ? <PillBadge size="xs">{t("archived")}</PillBadge> : null}
        </span>
        {skipped ? (
          <span className="mt-0.5 block text-[10.5px] leading-[1.45] text-fg-muted">
            {t("table.scheduledBy", { name: run.skippedBy?.name ?? t("aTeamMember") })}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2" data-testid={`run-actor-${run.id}`}>
      <Avatar
        alt=""
        className="grid h-6 w-6 shrink-0 place-items-center rounded-control bg-bg-sunken text-[9px] font-semibold text-fg-muted"
        initials={run.requestedBy.initials ?? "U"}
        src={run.requestedBy.avatarUrl}
      />
      <span className="truncate" title={run.requestedBy.name}>
        {run.requestedBy.name}
      </span>
    </span>
  );
}

export function NextCheckLine({ run }: Readonly<{ run: RankRunRecord }>) {
  const t = useTranslations("projectRuns.rankRuns");
  const nextCheckAt = run.nextCheckAt;
  const serverNow = run.snapshotAt ?? run.startedAt ?? run.launchedAt ?? nextCheckAt ?? "";
  const now = useLiveNow(
    serverNow,
    (run.status === "running" || run.status === "queued") &&
      Boolean(nextCheckAt) &&
      !run.snapshotAt,
  );

  if ((run.status !== "running" && run.status !== "queued") || !nextCheckAt) return null;
  const minutes = Math.max(
    0,
    Math.ceil((new Date(nextCheckAt).getTime() - new Date(now).getTime()) / 60_000),
  );
  const relative =
    minutes <= 0
      ? t("relative.dueNow")
      : minutes < 60
        ? t("relative.minutes", { count: minutes })
        : minutes < 1_440
          ? t("relative.hours", { count: Math.ceil(minutes / 60) })
          : t("relative.days", { count: Math.ceil(minutes / 1_440) });
  return (
    <span className="mt-1 block text-[10.5px] text-fg-muted">
      {run.status === "queued" ? t("firstCheck", { relative }) : t("nextCheck", { relative })}
    </span>
  );
}
