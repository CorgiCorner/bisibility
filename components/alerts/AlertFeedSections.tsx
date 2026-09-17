"use client";

import { AlertRowActions } from "@/components/alerts/AlertRowActions";
import {
  type PresentedAlertFeedView,
  presentAlertFeed,
} from "@/components/alerts/alert-feed-presentation";
import { FeedMetadataTokens } from "@/components/feeds/FacetToken";
import { Card } from "@/components/ui/Card";
import type {
  AlertDeliveryStateView,
  AlertSeverity,
  Device,
  TriggeredAlertFeedView,
} from "@/lib/alerts/alert-data";
import { severityMeta } from "@/lib/alerts/alert-data";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { LightbulbIcon as Lightbulb } from "@phosphor-icons/react/dist/csr/Lightbulb";
import { SirenIcon as Siren } from "@phosphor-icons/react/dist/csr/Siren";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/csr/Warning";
import type { Icon } from "@phosphor-icons/react/lib";
import { useTranslations } from "next-intl";

const severityOrder: AlertSeverity[] = ["urgent", "warning", "info"];

const severityIcons: Record<AlertSeverity, Icon> = {
  urgent: Siren,
  warning: Warning,
  info: Info,
};

const deliveryStateMeta = {
  dead_letter: { className: "text-red-text", message: "deadLetter" },
  delivered: { className: "text-green-text", message: "delivered" },
  delivering: { className: "text-yellow-text", message: "delivering" },
  digest_pending: { className: "text-yellow-text", message: "digestPending" },
  digested: { className: "text-green-text", message: "digested" },
  digesting: { className: "text-yellow-text", message: "digesting" },
  pending: { className: "text-yellow-text", message: "pending" },
  skipped: { className: "text-fg-muted", message: "skipped" },
  suppressed: { className: "text-fg-muted", message: "suppressed" },
} as const satisfies Record<AlertDeliveryStateView, { className: string; message: string }>;

function channelLabel(
  channel: string,
  t: ReturnType<typeof useTranslations<"projectAlerts.drawer">>,
) {
  if (channel === "email") return t("email");
  if (channel === "slack") return t("slack");
  if (channel === "webhook") return t("webhook");
  return channel;
}

function deviceLabel(device: Device, t: ReturnType<typeof useTranslations<"projectAlerts.feed">>) {
  return device === "desktop" ? t("deviceDesktop") : t("deviceMobile");
}

function severityLabel(
  severity: AlertSeverity,
  t: ReturnType<typeof useTranslations<"projectAlerts.feed">>,
) {
  if (severity === "urgent") return t("severityUrgent");
  if (severity === "warning") return t("severityWarning");
  return t("severityInfo");
}

function DeliveryStatus({
  alert,
  attempts,
}: Readonly<{
  alert: TriggeredAlertFeedView;
  attempts: PresentedAlertFeedView["deliveryAttempts"];
}>) {
  const t = useTranslations("projectAlerts.feed");
  const deliveryT = useTranslations("projectAlerts.delivery");
  const drawerT = useTranslations("projectAlerts.drawer");
  const meta = deliveryStateMeta[alert.deliveryState];

  return (
    <div className="mt-2 rounded-control border border-border bg-bg-sunken px-2.5 py-2 font-sans tabular-nums text-[10.5px]">
      <div className={`font-semibold ${meta.className}`}>
        {t("delivery", { state: deliveryT(meta.message) })}
      </div>
      {attempts.map((attempt, index) => (
        <div className="mt-1 text-fg-muted" key={`${attempt.when}:${attempt.channel}:${index}`}>
          {t("attempt", {
            channel: channelLabel(attempt.channel, drawerT),
            endpoint: attempt.endpoint ?? "none",
            error: attempt.error ?? "none",
            status: attempt.status,
            when: attempt.when,
          })}
        </div>
      ))}
    </div>
  );
}

export function isAlertUnread(alert: TriggeredAlertFeedView, readIds: Set<string>) {
  return alert.unread && !readIds.has(alert.id);
}

export function UnreadSummary({
  alerts,
  readIds,
}: Readonly<{
  alerts: TriggeredAlertFeedView[];
  readIds: Set<string>;
}>) {
  const t = useTranslations("projectAlerts.feed");

  return (
    <Card className="flex flex-col gap-3 px-4.5 py-3.5 sm:flex-row sm:items-center" size="md">
      <span className="text-[13px] font-semibold">{t("unreadAlerts")}</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {severityOrder.map((severity) => {
          const meta = severityMeta[severity];
          const count = alerts.filter(
            (alert) => alert.severity === severity && isAlertUnread(alert, readIds),
          ).length;

          return (
            <span className="inline-flex items-center gap-2" key={severity}>
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              <span className="text-[15px] font-semibold">{count}</span>
              <span className="font-sans tabular-nums text-[11px] text-fg-muted">
                {severityLabel(severity, t)}
              </span>
            </span>
          );
        })}
      </div>
      <span className="font-sans tabular-nums text-[11px] text-fg-muted sm:ml-auto">
        {t("last48Hours")}
      </span>
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
  alert: TriggeredAlertFeedView;
  onError: (message: string) => void;
  onSnooze: (id: string) => () => void;
  projectId: string;
  unread: boolean;
}>) {
  const t = useTranslations("projectAlerts.feed");
  const presentation = presentAlertFeed(alert, t);
  const meta = severityMeta[alert.severity];
  const Icon = severityIcons[alert.severity];

  return (
    <article className="flex gap-3.5 border-border border-b px-4.5 py-[15px]">
      <span
        className="mt-0.5 grid h-8.5 w-[34px] shrink-0 place-items-center rounded-control"
        style={{ backgroundColor: meta.background, color: meta.color }}
      >
        <Icon aria-hidden size={17} weight="regular" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[13.5px] font-semibold leading-snug">{presentation.headline}</h3>
          {unread ? <span className="h-[7px] w-[7px] rounded-full bg-accent" /> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-sans tabular-nums text-xs">
          <span className="font-semibold text-fg">{presentation.keyword}</span>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-fg-muted">
            <span className="truncate">{presentation.previous}</span>
            <ArrowRight aria-hidden size={10} weight="regular" />
            <span className="truncate font-semibold text-fg">{presentation.current}</span>
          </span>
        </div>
        <p className="m-0 mt-2 flex items-center gap-1.5 text-[12.5px] text-fg-muted">
          <Lightbulb weight="regular" aria-hidden className="shrink-0 text-accent-text" size={13} />
          {presentation.action}
        </p>
        {alert.targetUrl && alert.rankingUrl ? (
          <div className="mt-2 grid gap-1 font-sans tabular-nums text-[10.5px] text-fg-muted">
            <span className="truncate">{t("targetUrl", { url: alert.targetUrl })}</span>
            <span className="truncate">{t("rankingUrl", { url: alert.rankingUrl })}</span>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 font-sans tabular-nums text-[10.5px] text-fg-muted">
          <FeedMetadataTokens
            device={deviceLabel(alert.device, t)}
            metadata={presentation.metadata}
          />
          <span>{alert.rule}</span>
          <span>{presentation.when}</span>
        </div>
        <DeliveryStatus alert={alert} attempts={presentation.deliveryAttempts} />
        <AlertRowActions
          alertId={alert.id}
          ctas={presentation.ctas}
          keyword={presentation.keyword}
          onError={onError}
          onSnooze={onSnooze}
          projectId={projectId}
        />
      </div>
    </article>
  );
}
