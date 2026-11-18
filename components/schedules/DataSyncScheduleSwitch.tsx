"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import type { DataSyncSchedule } from "@/lib/schedules/types";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";

export type SaveDataSyncState = (input: {
  enabled: boolean;
  projectId: string;
  syncKind: DataSyncSchedule["sync_kind"];
}) => Promise<unknown>;

export function DataSyncScheduleSwitch({
  canUpdate,
  projectId,
  schedule,
  saveState,
}: Readonly<{
  canUpdate: boolean;
  projectId: string;
  schedule: DataSyncSchedule;
  saveState?: SaveDataSyncState;
}>) {
  const t = useTranslations("projectRuns.schedules");
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const [enabled, setEnabled] = useOptimistic(schedule.state === "active");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  // Background inspection off (or a fixed limit of 0) stops Page indexing regardless of this
  // switch. The budget is changed in its own setting, never silently from here.
  const budgetOff = schedule.state_reason === "inspection_budget_off";
  const disabled = !canUpdate || readOnly || pending || !saveState || budgetOff;

  function change(next: boolean) {
    if (disabled || !saveState) return;
    setFailed(false);
    startTransition(async () => {
      setEnabled(next);
      try {
        await saveState({ enabled: next, projectId, syncKind: schedule.sync_kind });
        startTransition(() => router.refresh());
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="grid justify-items-end gap-1">
      <Switch
        aria-label={t(`unified.syncs.${schedule.sync_kind}`)}
        checked={enabled}
        disabled={disabled}
        onChange={(event) => change(event.currentTarget.checked)}
      />
      {budgetOff ? (
        <Button
          href={`/app/${projectId}/settings/data-sources#url-inspection`}
          size="xs"
          variant="ghost"
        >
          {t("unified.inspectionSettings")}
        </Button>
      ) : null}
      {failed ? (
        <span role="alert" className="text-xs text-fg">
          {t("unified.syncSaveFailed")}
        </span>
      ) : null}
    </div>
  );
}
