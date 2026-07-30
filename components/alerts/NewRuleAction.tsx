"use client";

import { NewRuleDrawer } from "@/components/alerts/NewRuleDrawer";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui";
import type { AlertActionHandlers, AlertTargetOptions } from "@/lib/alerts/alert-data";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import { useState } from "react";

type NewRuleActionProps = {
  actions: Pick<
    AlertActionHandlers,
    | "createAlertRuleAction"
    | "deleteWebhookEndpointAction"
    | "testWebhookEndpointAction"
    | "updateAlertRuleAction"
    | "upsertWebhookEndpointAction"
  >;
  canManage: boolean;
  label?: string;
  projectDomain?: string | null;
  projectId: string;
  targets: AlertTargetOptions;
};

export function NewRuleAction({
  actions,
  canManage,
  label = "New rule",
  projectDomain,
  projectId,
  targets,
}: Readonly<NewRuleActionProps>) {
  const [open, setOpen] = useState(false);
  const { readOnly } = useProjectWriteMode();
  const resolvedProjectDomain = projectDomain ?? targets.projectDomain;

  return (
    <>
      <ProjectReadOnlyTooltip>
        <Button
          className="shrink-0"
          disabled={readOnly}
          onClick={() => setOpen(true)}
          size="sm"
          startIcon={<Plus aria-hidden size={14} weight="bold" />}
          type="button"
        >
          {label}
        </Button>
      </ProjectReadOnlyTooltip>
      <NewRuleDrawer
        actions={actions}
        canManageEndpoints={canManage}
        onClose={() => setOpen(false)}
        open={open}
        projectDomain={resolvedProjectDomain}
        projectId={projectId}
        targets={targets}
      />
    </>
  );
}
