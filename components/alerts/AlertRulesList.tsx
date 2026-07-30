"use client";

import { NewRuleDrawer } from "@/components/alerts/NewRuleDrawer";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, Card, SectionTitle, Switch } from "@/components/ui";
import type {
  AlertActionHandlers,
  AlertRuleView,
  AlertTargetOptions,
} from "@/lib/alerts/alert-data";
import { ruleStatusMeta, severityMeta } from "@/lib/alerts/alert-data";
import { MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY } from "@/lib/alerts/limits";
import {
  BellRingingIcon as BellRinging,
  ClockCountdownIcon as ClockCountdown,
  EnvelopeSimpleIcon as EnvelopeSimple,
  FunnelSimpleIcon as FunnelSimple,
  InfoIcon as Info,
  PencilSimpleIcon as PencilSimple,
  SlackLogoIcon as SlackLogo,
  TrashIcon as Trash,
  WebhooksLogoIcon as WebhooksLogo,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type AlertRulesListProps = {
  actions: AlertActionHandlers;
  canDelete: boolean;
  canManage: boolean;
  canUpdate: boolean;
  projectDomain?: string | null;
  projectId: string;
  rules: AlertRuleView[];
  targets: AlertTargetOptions;
};

const channelIcons: Record<string, Icon> = {
  Email: EnvelopeSimple,
  Slack: SlackLogo,
  Webhook: WebhooksLogo,
};

export function AlertRulesList({
  actions,
  canDelete,
  canManage,
  canUpdate,
  projectDomain,
  projectId,
  rules,
  targets,
}: Readonly<AlertRulesListProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editRule, setEditRule] = useState<AlertRuleView | null>(null);
  const { readOnly } = useProjectWriteMode();

  function run(work: () => Promise<unknown>) {
    if (readOnly) {
      return;
    }
    startTransition(() => {
      void work().then(() => router.refresh());
    });
  }

  return (
    <>
      <Card className="overflow-hidden p-0" size="md">
        <div className="border-border border-b px-[18px] py-3.5">
          <SectionTitle>Alert rules</SectionTitle>
          <p className="m-0 mt-1 font-mono text-[11px] leading-normal text-fg-faint">
            Rules are evaluated after rank checks. Each rule allows{" "}
            {MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY} delivery batches per UTC day, and one batch can
            fan out across every selected destination.
          </p>
        </div>
        {rules.map((rule) => {
          const severity = severityMeta[rule.severity];
          const status = ruleStatusMeta[rule.status];
          const active = rule.status === "active";
          const ChannelIcon = channelIcons[rule.channel] ?? BellRinging;

          return (
            <article
              className="flex flex-col gap-3 border-border-soft border-b px-[18px] py-[15px] sm:flex-row sm:items-center"
              key={rule.id}
            >
              <span
                className="hidden h-[38px] w-[5px] shrink-0 rounded-full sm:block"
                style={{ backgroundColor: severity.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-sm font-semibold">{rule.name}</h3>
                  <span
                    className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold"
                    style={{ backgroundColor: severity.background, color: severity.color }}
                  >
                    {severity.label}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold"
                    style={{ backgroundColor: status.background, color: status.color }}
                  >
                    {status.label}
                  </span>
                  {rule.depthConflict ? (
                    <span className="rounded-full bg-yellow/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-yellow">
                      won't fire below top {rule.depthConflict.trackedDepth}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1.5 font-mono text-[11.5px] text-fg-faint">
                  <span className="text-fg-muted">{rule.condition}</span>
                  <span className="inline-flex items-center gap-1">
                    <FunnelSimple aria-hidden size={12} />
                    {rule.scope}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ClockCountdown aria-hidden size={12} />
                    {rule.period}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ChannelIcon aria-hidden size={12} />
                    {rule.channel}
                  </span>
                  <span>{rule.fires}</span>
                </div>
              </div>
              {canUpdate ? (
                <ProjectReadOnlyTooltip>
                  <Switch
                    aria-label={active ? "Pause rule" : "Enable rule"}
                    checked={active}
                    className="shrink-0 border-0 bg-transparent p-0"
                    disabled={readOnly || isPending}
                    onChange={() =>
                      run(() =>
                        actions.setAlertRuleEnabledAction({
                          enabled: !rule.enabled,
                          projectId,
                          ruleId: rule.id,
                        }),
                      )
                    }
                  />
                </ProjectReadOnlyTooltip>
              ) : null}
              {canUpdate ? (
                <ProjectReadOnlyTooltip>
                  <Button
                    aria-label={`Edit ${rule.name}`}
                    disabled={readOnly}
                    onClick={() => setEditRule(rule)}
                    size="sm"
                    sx={{ minHeight: 32, minWidth: 32, padding: 0 }}
                    type="button"
                    variant="secondary"
                  >
                    <PencilSimple aria-hidden size={14} />
                  </Button>
                </ProjectReadOnlyTooltip>
              ) : null}
              {canDelete ? (
                <ProjectReadOnlyTooltip>
                  <Button
                    aria-label={`Delete ${rule.name}`}
                    disabled={readOnly || isPending}
                    onClick={() =>
                      run(() => actions.deleteAlertRuleAction({ projectId, ruleId: rule.id }))
                    }
                    size="sm"
                    sx={{
                      color: "var(--red)",
                      minHeight: 32,
                      minWidth: 32,
                      padding: 0,
                      "&:hover": { borderColor: "var(--red)", color: "var(--red)" },
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <Trash aria-hidden size={14} />
                  </Button>
                </ProjectReadOnlyTooltip>
              ) : null}
            </article>
          );
        })}
        <p className="m-0 flex items-center gap-2 px-[18px] py-3 text-xs text-fg-faint">
          <Info aria-hidden className="shrink-0 text-accent" size={14} />
          Trend-style rules start after enough completed checks to compare changes.
        </p>
      </Card>
      {editRule ? (
        <NewRuleDrawer
          actions={actions}
          canManageEndpoints={canManage}
          initialRule={editRule}
          key={editRule.id}
          onClose={() => setEditRule(null)}
          open
          projectDomain={projectDomain}
          projectId={projectId}
          targets={targets}
        />
      ) : null}
    </>
  );
}
