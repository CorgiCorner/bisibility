import type {
  AlertChannelInput,
  AlertConditionTypeInput,
  AlertTargetTypeInput,
} from "@/lib/alerts/schema";
import type { AlertSeverity as AlertSeverityValue } from "@/lib/alerts/severity";
import { ruleTemplates } from "./new-rule-data";

export type AlertSeverity = AlertSeverityValue;
export type AlertRuleStatus = "active" | "paused" | "learning" | "setup";
export type AlertDeliveryStateView =
  | "dead_letter"
  | "delivered"
  | "delivering"
  | "digest_pending"
  | "digested"
  | "digesting"
  | "pending"
  | "skipped"
  | "suppressed";

export type AlertDeliveryAttemptView = {
  channel: AlertChannelInput;
  error: string | null;
  status: string;
  webhookEndpointId: string | null;
  webhookEndpointLabel: string | null;
  when: string;
};

export type TriggeredAlertView = {
  action: string;
  ctas: string[];
  current: string;
  deliveryAttempts: AlertDeliveryAttemptView[];
  deliveryState: AlertDeliveryStateView;
  headline: string;
  id: string;
  keyword: string;
  previous: string;
  rankingUrl?: string | null;
  rule: string;
  severity: AlertSeverity;
  targetUrl?: string | null;
  unread: boolean;
  when: string;
};

export type AlertTemplate = {
  id: string;
  label: string;
  requirement?: string;
  severity: AlertSeverity;
};

export type AlertTargetOptions = {
  keywords: { id: string; label: string }[];
  members: { id: string; label: string }[];
  projectDomain?: string;
  tags: { id: string; label: string }[];
  webhookEndpoints?: WebhookEndpointView[];
  webhookPrivateNetworkAllowed?: boolean;
};

export type WebhookEndpointView = {
  deliveryAttempts?: {
    attemptedAt: string;
    error: string | null;
    event: "alert.digest" | "alert.fired";
    status: string;
  }[];
  description: string | null;
  enabled: boolean;
  id: string;
  lastDeliveryAt?: string | null;
  url: string;
};

export type AlertRuleView = {
  channel: string;
  channels: AlertChannelInput[];
  changePct: number | null;
  condition: string;
  conditionType: AlertConditionTypeInput;
  competitorDomain: string | null;
  dropPositions: number | null;
  depthConflict?: { threshold: number; trackedDepth: number } | null;
  enabled: boolean;
  fires: string;
  id: string;
  name: string;
  period: string;
  recipientIds: string[];
  scope: string;
  serpFeature: string | null;
  severity: AlertSeverity;
  status: AlertRuleStatus;
  targetIds: string[];
  targetType: AlertTargetTypeInput;
  thresholdPosition: number | null;
  topN: number | null;
};

export type AlertActionHandlers = {
  createAlertRuleAction: (input: unknown) => Promise<unknown>;
  deleteAlertRuleAction: (input: unknown) => Promise<unknown>;
  deleteWebhookEndpointAction: (input: unknown) => Promise<unknown>;
  setAlertRuleEnabledAction: (input: unknown) => Promise<unknown>;
  testWebhookEndpointAction: (input: unknown) => Promise<unknown>;
  upsertWebhookEndpointAction: (input: unknown) => Promise<unknown>;
  updateAlertRuleAction: (input: unknown) => Promise<unknown>;
};

export const severityMeta = {
  urgent: {
    background: "color-mix(in srgb, var(--red) 12%, transparent)",
    color: "var(--red)",
    label: "Urgent",
  },
  warning: {
    background: "color-mix(in srgb, var(--yellow) 14%, transparent)",
    color: "var(--yellow)",
    label: "Warning",
  },
  info: {
    background: "color-mix(in srgb, var(--blue) 12%, transparent)",
    color: "var(--blue)",
    label: "Info",
  },
} satisfies Record<AlertSeverity, { background: string; color: string; label: string }>;

export const ruleStatusMeta = {
  active: {
    background: "color-mix(in srgb, var(--green) 12%, transparent)",
    color: "var(--green)",
    label: "Active",
  },
  paused: {
    background: "var(--bg-sunken)",
    color: "var(--fg-faint)",
    label: "Paused",
  },
  learning: {
    background: "color-mix(in srgb, var(--blue) 12%, transparent)",
    color: "var(--blue)",
    label: "Learning",
  },
  setup: {
    background: "color-mix(in srgb, var(--yellow) 14%, transparent)",
    color: "var(--yellow)",
    label: "Needs setup",
  },
} satisfies Record<AlertRuleStatus, { background: string; color: string; label: string }>;

export const alertTemplates = Object.entries(ruleTemplates).map(([id, template]) => ({
  id,
  label: template.label,
  requirement: "requirement" in template ? template.requirement : undefined,
  severity: template.severity,
})) satisfies AlertTemplate[];
