import type { Action, ResourceType } from "@/lib/auth/capabilities";

export type OperationCapability = { action: Action; resourceType: ResourceType };

export const deleteAlertRule = {
  action: "delete",
  resourceType: "alert_rule",
} as const satisfies OperationCapability;

export const deleteCompetitor = {
  action: "delete",
  resourceType: "competitor",
} as const satisfies OperationCapability;

export const deleteKeyword = {
  action: "delete",
  resourceType: "keyword",
} as const satisfies OperationCapability;

export const deleteProject = {
  action: "delete",
  resourceType: "project",
} as const satisfies OperationCapability;

export const manageProject = {
  action: "manage",
  resourceType: "project",
} as const satisfies OperationCapability;

export const manageProviderConnection = {
  action: "manage",
  resourceType: "provider_connection",
} as const satisfies OperationCapability;

export const manageTeam = {
  action: "manage",
  resourceType: "team",
} as const satisfies OperationCapability;

export const manageWebhookEndpoint = {
  action: "manage",
  resourceType: "webhook_endpoint",
} as const satisfies OperationCapability;

export const updateNotificationPreference = {
  action: "update",
  resourceType: "notification_preference",
} as const satisfies OperationCapability;
