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
  if (!canCreate) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <NewRuleAction
        actions={actions}
        canManage={canManage}
        projectDomain={projectDomain ?? targets.projectDomain}
        projectId={projectId}
        targets={targets}
      />
    </div>
  );
}
