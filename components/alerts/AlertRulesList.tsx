"use client";

import { useRuleEnabledQueue } from "@/components/alerts/alert-rule-enabled-queue";
import { presentAlertRule } from "@/components/alerts/alert-rule-presentation";
import { NewRuleDrawer } from "@/components/alerts/NewRuleDrawer";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Switch } from "@/components/ui/Switch";
import type {
  AlertActionHandlers,
  AlertRuleView,
  AlertTargetOptions,
} from "@/lib/alerts/alert-data";
import { ruleStatusMeta, severityMeta } from "@/lib/alerts/alert-data";
import { MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY } from "@/lib/alerts/limits";
import { BellRingingIcon as BellRinging } from "@phosphor-icons/react/dist/csr/BellRinging";
import { ClockCountdownIcon as ClockCountdown } from "@phosphor-icons/react/dist/csr/ClockCountdown";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { FunnelSimpleIcon as FunnelSimple } from "@phosphor-icons/react/dist/csr/FunnelSimple";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { SlackLogoIcon as SlackLogo } from "@phosphor-icons/react/dist/csr/SlackLogo";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { WebhooksLogoIcon as WebhooksLogo } from "@phosphor-icons/react/dist/csr/WebhooksLogo";
import type { Icon } from "@phosphor-icons/react/lib";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

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

const channelIcons: Record<AlertRuleView["channels"][number], Icon> = {
  email: EnvelopeSimple,
  slack: SlackLogo,
  webhook: WebhooksLogo,
};

function AlertRuleEnabledSwitch({
  actions,
  projectId,
  readOnly,
  rule,
}: Readonly<{
  actions: AlertActionHandlers;
  projectId: string;
  readOnly: boolean;
  rule: AlertRuleView;
}>) {
  const t = useTranslations("projectAlerts.rules");
  const router = useRouter();
  const toggle = useRuleEnabledQueue(
    rule.enabled,
    async (enabled) => {
      await actions.setAlertRuleEnabledAction({ enabled, projectId, ruleId: rule.id });
      router.refresh();
    },
    t("updateError"),
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        aria-busy={toggle.pending || undefined}
        aria-label={toggle.enabled ? t("pauseRule") : t("enableRule")}
        checked={toggle.enabled}
        className="shrink-0 border-0 bg-transparent p-0"
        disabled={readOnly}
        onChange={() => toggle.request(!toggle.enabled)}
      />
      {toggle.error ? (
        <span className="text-[10px] text-red-text" role="alert">
          {toggle.error}
        </span>
      ) : null}
    </div>
  );
}

function channelLabel(
  channel: AlertRuleView["channels"][number] | undefined,
  t: ReturnType<typeof useTranslations<"projectAlerts.drawer">>,
) {
  if (channel === "email") return t("email");
  if (channel === "slack") return t("slack");
  if (channel === "webhook") return t("webhook");
  return t("inAppFeed");
}

function severityLabel(
  severity: AlertRuleView["severity"],
  t: ReturnType<typeof useTranslations<"projectAlerts.feed">>,
) {
  if (severity === "urgent") return t("severityUrgent");
  if (severity === "warning") return t("severityWarning");
  return t("severityInfo");
}

function statusLabel(
  status: AlertRuleView["status"],
  t: ReturnType<typeof useTranslations<"projectAlerts.rules">>,
) {
  if (status === "active") return t("statusActive");
  if (status === "paused") return t("statusPaused");
  if (status === "learning") return t("statusLearning");
  return t("statusSetup");
}

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
  const t = useTranslations("projectAlerts.rules");
  const feedT = useTranslations("projectAlerts.feed");
  const drawerT = useTranslations("projectAlerts.drawer");
  const router = useRouter();
  const [editRule, setEditRule] = useState<AlertRuleView | null>(null);
  const { readOnly } = useProjectWriteMode();

  return (
    <>
      <Card className="overflow-hidden p-0" size="md">
        <div className="border-border border-b px-4.5 py-3.5">
          <SectionTitle>{t("title")}</SectionTitle>
          <p className="m-0 mt-1 font-sans tabular-nums text-[11px] leading-normal text-fg-muted">
            {t("description", { limit: MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY })}
          </p>
        </div>
        {rules.map((rule) => {
          const severity = severityMeta[rule.severity];
          const status = ruleStatusMeta[rule.status];
          const channel = rule.channels[0];
          const ChannelIcon = channel ? channelIcons[channel] : BellRinging;
          const presentation = presentAlertRule(rule, t);

          return (
            <article
              className="flex flex-col gap-3 border-border border-b px-4.5 py-[15px] sm:flex-row sm:items-center"
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
                    className="rounded-full px-2 py-0.5 font-sans tabular-nums text-[10px] font-semibold"
                    style={{ backgroundColor: severity.background, color: severity.color }}
                  >
                    {severityLabel(rule.severity, feedT)}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 font-sans tabular-nums text-[10px] font-semibold"
                    style={{ backgroundColor: status.background, color: status.color }}
                  >
                    {statusLabel(rule.status, t)}
                  </span>
                  {rule.depthConflict ? (
                    <span className="rounded-full bg-yellow/15 px-2 py-0.5 font-sans tabular-nums text-[10px] font-semibold text-yellow-text">
                      {t("depthConflict", { depth: rule.depthConflict.trackedDepth })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1.5 font-sans tabular-nums text-[11.5px] text-fg-muted">
                  <span className="text-fg-muted">{presentation.condition}</span>
                  <span className="inline-flex items-center gap-1">
                    <FunnelSimple weight="regular" aria-hidden size={12} />
                    {presentation.scope}
                  </span>
                  <span>{presentation.marketScope}</span>
                  <span className="inline-flex items-center gap-1">
                    <ClockCountdown weight="regular" aria-hidden size={12} />
                    {presentation.period}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ChannelIcon aria-hidden size={12} weight="regular" />
                    {channelLabel(channel, drawerT)}
                  </span>
                  <span>{presentation.fires}</span>
                </div>
              </div>
              {canUpdate ? (
                <ProjectReadOnlyTooltip>
                  <AlertRuleEnabledSwitch
                    actions={actions}
                    projectId={projectId}
                    readOnly={readOnly}
                    rule={rule}
                  />
                </ProjectReadOnlyTooltip>
              ) : null}
              {canUpdate ? (
                <ProjectReadOnlyTooltip>
                  <Button
                    aria-label={t("edit", { name: rule.name })}
                    disabled={readOnly}
                    onClick={() => setEditRule(rule)}
                    size="sm"
                    style={{ minHeight: 32, minWidth: 32, padding: 0 }}
                    type="button"
                    variant="secondary"
                  >
                    <PencilSimple weight="regular" aria-hidden size={14} />
                  </Button>
                </ProjectReadOnlyTooltip>
              ) : null}
              {canDelete ? (
                <ProjectReadOnlyTooltip>
                  <Button
                    aria-label={t("delete", { name: rule.name })}
                    disabled={readOnly}
                    onClick={() =>
                      void actions
                        .deleteAlertRuleAction({ projectId, ruleId: rule.id })
                        .then(() => router.refresh())
                    }
                    size="sm"
                    style={{
                      "--control-color": "var(--red)",
                      minHeight: 32,
                      minWidth: 32,
                      padding: 0,
                      "--control-hover-border-color": "var(--red)",
                      "--control-hover-color": "var(--red)",
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <Trash weight="regular" aria-hidden size={14} />
                  </Button>
                </ProjectReadOnlyTooltip>
              ) : null}
            </article>
          );
        })}
        <p className="m-0 flex items-center gap-2 px-4.5 py-3 text-xs text-fg-muted">
          <Info weight="regular" aria-hidden className="shrink-0 text-accent-text" size={14} />
          {t("trendInfo")}
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
