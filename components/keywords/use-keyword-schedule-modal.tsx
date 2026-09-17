"use client";

import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SetScheduleModal } from "./grid/SetScheduleModal";
import type {
  CheckScheduleSummary,
  ScheduleLoadProblem,
  ScheduleLoadState,
} from "./grid/set-schedule-model";

type UseKeywordScheduleModalArgs = {
  keyword: KeywordRow;
  projectId: string;
  providerRate?: CostRateInfo;
};

class ScheduleLoadError extends Error {
  constructor(readonly problem: ScheduleLoadProblem) {
    super(problem);
  }
}

function loadProblem(response: Response, body: unknown): ScheduleLoadProblem {
  const code =
    body && typeof body === "object" && "type" in body && typeof body.type === "string"
      ? body.type.split("/").at(-1)
      : null;
  if (response.status === 401 || code === "unauthorized") return "unauthorized";
  if (response.status === 403 || code === "forbidden") return "forbidden";
  if (response.status === 404 || code === "not_found") return "notFound";
  if (response.status === 400 || code === "validation_failed") return "validation";
  return "unknown";
}

export async function loadSchedules(projectId: string): Promise<CheckScheduleSummary[]> {
  const response = await fetch(`/api/check-schedules?project=${encodeURIComponent(projectId)}`, {
    headers: { Accept: "application/json" },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ScheduleLoadError(loadProblem(response, body));
  }
  if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) {
    throw new ScheduleLoadError("unknown");
  }
  return body.data as CheckScheduleSummary[];
}

export function useKeywordScheduleModal({
  keyword,
  projectId,
  providerRate,
}: UseKeywordScheduleModalArgs) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [schedules, setSchedules] = useState<CheckScheduleSummary[]>([]);
  const [scheduleLoadError, setScheduleLoadError] = useState<ScheduleLoadProblem | null>(null);
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
      setScheduleLoadError(error instanceof ScheduleLoadError ? error.problem : "unknown");
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
