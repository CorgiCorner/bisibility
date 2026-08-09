"use client";

import { NewRuleDrawer } from "@/components/alerts/NewRuleDrawer";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui";
import type {
  AlertActionHandlers,
  AlertTargetOptions,
  AlertTemplate,
} from "@/lib/alerts/alert-data";
import {
  isRuleTemplateId,
  type RuleTemplateId,
  ruleSeverityMeta,
} from "@/lib/alerts/new-rule-data";
import {
  ArrowLineDownIcon as ArrowLineDown,
  CursorClickIcon as CursorClick,
  LinkBreakIcon as LinkBreak,
  TrendDownIcon as TrendDown,
  TrophyIcon as Trophy,
  UsersThreeIcon as UsersThree,
} from "@phosphor-icons/react";
import { useState } from "react";

type AlertTemplateButtonsProps = {
  actions: Pick<
    AlertActionHandlers,
    | "createAlertRuleAction"
    | "deleteWebhookEndpointAction"
    | "testWebhookEndpointAction"
    | "updateAlertRuleAction"
    | "upsertWebhookEndpointAction"
  >;
  canManage: boolean;
  gscConnected: boolean;
  gscInstallHref: string;
  projectDomain?: string | null;
  projectId: string;
  targets: AlertTargetOptions;
  templates: AlertTemplate[];
};

const templateIcons = {
  competitor: UsersThree,
  ctr: CursorClick,
  downtrend: TrendDown,
  positiondrop: ArrowLineDown,
  slipped: ArrowLineDown,
  top3: Trophy,
  wrongurl: LinkBreak,
};

export function AlertTemplateButtons({
  actions,
  canManage,
  gscConnected,
  gscInstallHref,
  projectDomain,
  projectId,
  targets,
  templates,
}: Readonly<AlertTemplateButtonsProps>) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<RuleTemplateId>("slipped");
  const { readOnly } = useProjectWriteMode();
  const resolvedProjectDomain = projectDomain ?? targets.projectDomain;

  function openTemplate(id: string) {
    if (readOnly || !isRuleTemplateId(id)) {
      return;
    }
    setTemplate(id);
    setOpen(true);
  }

  return (
    <>
      {templates.map((item) => {
        const Icon = templateIcons[item.id as keyof typeof templateIcons];
        const meta = ruleSeverityMeta[item.severity];
        const requiresGsc = item.id === "ctr" && !gscConnected;

        return (
          <span className="inline-flex items-center gap-1.5" key={item.id}>
            <ProjectReadOnlyTooltip>
              <Button
                className="min-h-10 gap-2"
                disabled={readOnly || requiresGsc}
                onClick={() => openTemplate(item.id)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: meta.color }} />
                {Icon ? <Icon aria-hidden className="text-fg-muted" size={14} /> : null}
                {item.label}
              </Button>
            </ProjectReadOnlyTooltip>
            {requiresGsc && item.requirement ? (
              <a
                className="rounded-full bg-bg-sunken px-1.5 py-0.5 font-mono text-[8.5px] uppercase text-fg-muted outline-none transition-colors hover:text-accent-text focus-visible:text-accent-text"
                href={gscInstallHref}
              >
                {item.requirement}
              </a>
            ) : null}
          </span>
        );
      })}
      <NewRuleDrawer
        actions={actions}
        canManageEndpoints={canManage}
        initialTemplate={template}
        key={template}
        onClose={() => setOpen(false)}
        open={open}
        projectDomain={resolvedProjectDomain}
        projectId={projectId}
        targets={targets}
      />
    </>
  );
}
