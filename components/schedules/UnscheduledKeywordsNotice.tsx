"use client";

import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AddKeywordsDrawer } from "./AddKeywordsDrawer";
import type { ScheduleEditorCandidate } from "./ScheduleEditorModel";

export function UnscheduledKeywordsNotice({
  canEdit,
  candidates,
  schedules,
  projectId,
}: Readonly<{
  canEdit: boolean;
  candidates: readonly ScheduleEditorCandidate[];
  schedules: readonly { publicId: string; name: string; enabled: boolean; isDefault?: boolean }[];
  projectId: string;
}>) {
  const t = useTranslations("projectRuns.schedules");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const destinations = schedules.filter((schedule) => schedule.enabled);
  const initialSchedule = destinations.find((schedule) => schedule.isDefault) ?? destinations[0];
  const unscheduled = candidates.filter((candidate) => candidate.scheduleId === null);
  if (!unscheduled.length) return null;
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-bg-elev px-4 py-3">
        <p className="m-0 text-[12px] text-fg-muted">
          {t("summary.unscheduledCount", { count: unscheduled.length })}
        </p>
        {canEdit && initialSchedule ? (
          <Button onClick={() => setOpen(true)} size="sm" type="button" variant="secondary">
            {t("summary.addToSchedule")}
          </Button>
        ) : null}
      </div>
      {initialSchedule && canEdit ? (
        <AddKeywordsDrawer
          candidates={unscheduled.map((candidate) => ({
            id: candidate.publicId,
            keyword: candidate.name,
            market: candidate.market,
            device: candidate.device,
            tags: candidate.tags,
            checks: candidate.targetCount,
          }))}
          onAssigned={() => router.refresh()}
          onClose={() => setOpen(false)}
          open={open}
          projectId={projectId}
          scheduleId={initialSchedule.publicId}
          scheduleName={initialSchedule.name}
          schedules={destinations}
        />
      ) : null}
    </>
  );
}
