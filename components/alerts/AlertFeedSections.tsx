"use client";

import { AlertRowActions } from "@/components/alerts/AlertRowActions";
import { Card } from "@/components/ui";
import type {
  AlertDeliveryStateView,
  AlertSeverity,
  TriggeredAlertView,
} from "@/lib/alerts/alert-data";
import { severityMeta } from "@/lib/alerts/alert-data";
import {
  ArrowRightIcon as ArrowRight,
  InfoIcon as Info,
  LightbulbIcon as Lightbulb,
  SirenIcon as Siren,
  WarningIcon as Warning,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";

const severityOrder: AlertSeverity[] = ["urgent", "warning", "info"];

const severityIcons: Record<AlertSeverity, Icon> = {
  urgent: Siren,
  warning: Warning,
  info: Info,
};

const deliveryStateMeta = {
  dead_letter: { className: "text-red", label: "Failed / dead letter" },
  delivered: { className: "text-green", label: "Delivered" },
  delivering: { className: "text-yellow", label: "Delivering / retrying" },
  digest_pending: { className: "text-yellow", label: "Digest pending" },
  digested: { className: "text-green", label: "Delivered in digest" },
  digesting: { className: "text-yellow", label: "Digesting" },
  pending: { className: "text-yellow", label: "Pending" },
  skipped: { className: "text-fg-faint", label: "Skipped" },
  suppressed: { className: "text-fg-faint", label: "Suppressed by daily delivery-batch limit" },
} satisfies Record<AlertDeliveryStateView, { className: string; label: string }>;

function DeliveryStatus({ alert }: Readonly<{ alert: TriggeredAlertView }>) {
  const meta = deliveryStateMeta[alert.deliveryState];

  return (
    <div className="mt-2 rounded-lg border border-border-soft bg-bg-sunken px-2.5 py-2 font-mono text-[10.5px]">
      <div className={`font-semibold ${meta.className}`}>Delivery: {meta.label}</div>
      {alert.deliveryAttempts.map((attempt, index) => (
        <div className="mt-1 text-fg-muted" key={`${attempt.when}:${attempt.channel}:${index}`}>
          {attempt.channel[0].toUpperCase() + attempt.channel.slice(1)} {attempt.status}
          {attempt.webhookEndpointLabel ? ` (${attempt.webhookEndpointLabel})` : ""}
          {attempt.error ? `: ${attempt.error}` : ""} / {attempt.when}
        </div>
      ))}
    </div>
  );
}

export function isAlertUnread(alert: TriggeredAlertView, readIds: Set<string>) {
  return alert.unread && !readIds.has(alert.id);
}

export function UnreadSummary({
  alerts,
  readIds,
}: Readonly<{
  alerts: TriggeredAlertView[];
  readIds: Set<string>;
}>) {
  return (
    <Card className="flex flex-col gap-3 px-[18px] py-3.5 sm:flex-row sm:items-center" size="md">
      <span className="text-[13px] font-semibold">Unread alerts</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {severityOrder.map((severity) => {
          const meta = severityMeta[severity];
          const Icon = severityIcons[severity];
          const count = alerts.filter(
            (alert) => alert.severity === severity && isAlertUnread(alert, readIds),
          ).length;

          return (
            <span className="inline-flex items-center gap-2" key={severity}>
              <span
                className="grid h-[26px] w-[26px] place-items-center rounded-lg"
                style={{ backgroundColor: meta.background, color: meta.color }}
              >
                <Icon aria-hidden size={14} weight="fill" />
              </span>
              <span className="text-[15px] font-semibold">{count}</span>
              <span className="font-mono text-[11px] text-fg-faint">{meta.label}</span>
            </span>
          );
        })}
      </div>
      <span className="font-mono text-[11px] text-fg-faint sm:ml-auto">last 48h</span>
    </Card>
  );
}

export function AlertFeedRow({
  alert,
  onSnooze,
  onError,
  projectId,
  unread,
}: Readonly<{
  alert: TriggeredAlertView;
  onError: (message: string) => void;
  onSnooze: (id: string) => () => void;
  projectId: string;
  unread: boolean;
}>) {
  const meta = severityMeta[alert.severity];
  const Icon = severityIcons[alert.severity];

  return (
    <article className="flex gap-3.5 border-border-soft border-b px-[18px] py-[15px]">
      <span
        className="mt-0.5 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]"
        style={{ backgroundColor: meta.background, color: meta.color }}
      >
        <Icon aria-hidden size={17} weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[13.5px] font-semibold leading-snug">{alert.headline}</h3>
          {unread ? <span className="h-[7px] w-[7px] rounded-full bg-accent" /> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs">
          <span className="font-semibold text-fg">{alert.keyword}</span>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-fg-muted">
            <span className="truncate">{alert.previous}</span>
            <ArrowRight aria-hidden size={10} weight="bold" />
            <span className="truncate font-semibold text-fg">{alert.current}</span>
          </span>
        </div>
        <p className="m-0 mt-2 flex items-center gap-1.5 text-[12.5px] text-fg-muted">
          <Lightbulb aria-hidden className="shrink-0 text-accent" size={13} />
          {alert.action}
        </p>
        {alert.targetUrl && alert.rankingUrl ? (
          <div className="mt-2 grid gap-1 font-mono text-[10.5px] text-fg-faint">
            <span className="truncate">Target URL: {alert.targetUrl}</span>
            <span className="truncate">Ranking URL: {alert.rankingUrl}</span>
          </div>
        ) : null}
        <p className="m-0 mt-2 font-mono text-[10.5px] text-fg-faint">
          {meta.label} / {alert.rule} / Google / US / Desktop / {alert.when}
        </p>
        <DeliveryStatus alert={alert} />
        <AlertRowActions
          alertId={alert.id}
          ctas={alert.ctas}
          keyword={alert.keyword}
          onError={onError}
          onSnooze={onSnooze}
          projectId={projectId}
        />
      </div>
    </article>
  );
}
