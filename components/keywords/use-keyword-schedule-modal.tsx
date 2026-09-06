"use client";

import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SetScheduleModal } from "./grid/SetScheduleModal";
import type { CheckScheduleSummary, ScheduleLoadState } from "./grid/set-schedule-model";

type UseKeywordScheduleModalArgs = {
  keyword: KeywordRow;
  projectId: string;
  providerRate?: CostRateInfo;
};

async function loadSchedules(projectId: string): Promise<CheckScheduleSummary[]> {
  const response = await fetch(`/api/check-schedules?project=${encodeURIComponent(projectId)}`, {
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as { data?: CheckScheduleSummary[]; detail?: string };
  if (!response.ok || !body.data) {
    throw new Error(body.detail || "Could not load schedules. Try again.");
  }
  return body.data;
}

export function useKeywordScheduleModal({
  keyword,
  projectId,
  providerRate,
}: UseKeywordScheduleModalArgs) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [schedules, setSchedules] = useState<CheckScheduleSummary[]>([]);
  const [scheduleLoadError, setScheduleLoadError] = useState<string | null>(null);
  const [scheduleLoadState, setScheduleLoadState] = useState<ScheduleLoadState>("loading");

  async function onChangeSchedule() {
    setSchedules([]);
    setScheduleLoadError(null);
    setScheduleLoadState("loading");
    setOpen(true);
    try {
      setSchedules(await loadSchedules(projectId));
      setScheduleLoadState("loaded");
    } catch (error) {
      setScheduleLoadError(
        error instanceof Error ? error.message : "Could not load schedules. Try again.",
      );
      setScheduleLoadState("error");
    }
  }

  return {
    onChangeSchedule,
    scheduleModal: open ? (
      <SetScheduleModal
        currentScheduleId={keyword.checkSchedule?.publicId ?? null}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false);
          router.refresh();
        }}
        open
        projectId={projectId}
        providerRate={providerRate}
        scheduleLoadError={scheduleLoadError}
        scheduleLoadState={scheduleLoadState}
        schedules={schedules}
        selectedRows={[keyword]}
      />
    ) : null,
  };
}
