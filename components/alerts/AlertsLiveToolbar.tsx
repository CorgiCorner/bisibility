"use client";

import { NewRuleAction } from "@/components/alerts/NewRuleAction";
import type { AlertActionHandlers, AlertTargetOptions } from "@/lib/alerts/alert-data";

type AlertsLiveToolbarProps = {
  actions: AlertActionHandlers;
  canCreate: boolean;
  canManage: boolean;
  projectDomain?: string | null;
  projectId: string;
  targets: AlertTargetOptions;
};

export function AlertsLiveToolbar({
  actions,
  canCreate,
  canManage,
  projectDomain,
  projectId,
  targets,
}: Readonly<AlertsLiveToolbarProps>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2.5 font-mono text-[11.5px] text-fg-muted">
        <span className="relative grid h-2 w-2 place-items-center text-green-text">
          <span className="bv-ping absolute h-2 w-2 rounded-full bg-green" />
          <span className="h-1.5 w-1.5 rounded-full bg-green" />
        </span>
        {"Live / rules evaluated after each completed rank check "}
      </span>
      {canCreate ? (
        <NewRuleAction
          actions={actions}
          canManage={canManage}
          projectDomain={projectDomain ?? targets.projectDomain}
          projectId={projectId}
          targets={targets}
        />
      ) : null}
    </div>
  );
}
