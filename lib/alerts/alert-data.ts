import type {
  AlertChannelInput,
  AlertConditionTypeInput,
  AlertTargetTypeInput,
} from "@/lib/alerts/schema";
import type { AlertSeverity as AlertSeverityValue } from "@/lib/alerts/severity";
import type { FeedRowMetadata } from "@/lib/feeds/facets";
import type { Device } from "@/lib/generated/prisma/client";
import { ruleTemplates } from "./new-rule-data";

export type { Device };

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
  location: string;
  device: Device;
  feedMeta?: FeedRowMetadata;
  previous: string;
  rankingUrl?: string | null;
  rule: string;
  severity: AlertSeverity;
  targetUrl?: string | null;
  unread: boolean;
  when: string;
};

/**
 * Data consumed by the localized project alert feed. This deliberately avoids
 * the durable notification payload strings used by email, webhooks, and the
 * REST resource. The client presentation adapter owns human-readable copy.
 */
export type TriggeredAlertFeedView = {
  afterPosition: number | null;
  beforePosition: number | null;
  condition: {
    changePct: number | null;
    competitorDomain: string | null;
    dropPositions: number | null;
    serpFeature: string | null;
    thresholdPosition: number | null;
    topN: number | null;
  };
  conditionType: AlertConditionTypeInput;
  deliveryAttempts: {
    attemptedAt: string;
    channel: AlertChannelInput;
    error: string | null;
    status: string;
    webhookEndpoint: { id: string; label: string } | null;
  }[];
  deliveryState: AlertDeliveryStateView;
  device: Device;
  feedMeta?: FeedRowMetadata;
  firedAt: string;
  id: string;
  keyword: string | null;
  rankingUrl?: string | null;
  rule: string;
  severity: AlertSeverity;
  targetUrl?: string | null;
  unread: boolean;
};

export type AlertTemplate = {
  id: string;
  label: string;
  requirement?: string;
  severity: AlertSeverity;
};

export type AlertTargetOptions = {
  keywords: { id: string; label: string }[];
  markets: { canonicalKey: string; id: string; label: string }[];
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
  channels: AlertChannelInput[];
  changePct: number | null;
  conditionType: AlertConditionTypeInput;
  competitorDomain: string | null;
  dropPositions: number | null;
  depthConflict?: { threshold: number; trackedDepth: number } | null;
  enabled: boolean;
  firedThisWeek: number;
  id: string;
  marketIds: string[];
  marketScope?: { count: number; label?: string };
  name: string;
  period: "ctr_baseline" | "each_check";
  recipientIds: string[];
  scope: { labels: string[]; targetType: AlertTargetTypeInput };
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
    color: "var(--yellow-text)",
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
    color: "var(--green-text)",
    label: "Active",
  },
  paused: {
    background: "var(--bg-sunken)",
    color: "var(--fg-muted)",
    label: "Paused",
  },
  learning: {
    background: "color-mix(in srgb, var(--blue) 12%, transparent)",
    color: "var(--blue)",
    label: "Learning",
  },
  setup: {
    background: "color-mix(in srgb, var(--yellow) 14%, transparent)",
    color: "var(--yellow-text)",
    label: "Needs setup",
  },
} satisfies Record<AlertRuleStatus, { background: string; color: string; label: string }>;

export const alertTemplates = Object.entries(ruleTemplates).map(([id, template]) => ({
  id,
  label: template.label,
  requirement: "requirement" in template ? template.requirement : undefined,
  severity: template.severity,
})) satisfies AlertTemplate[];
