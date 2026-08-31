import {
  CrownSimpleIcon as CrownSimple,
  GaugeIcon as Gauge,
  KeyIcon as Key,
  PlugsIcon as Plugs,
  TrashIcon as Trash,
  UserMinusIcon as UserMinus,
  UserPlusIcon as UserPlus,
  WarningIcon as Warning,
} from "@phosphor-icons/react";

export type ConfirmKind =
  | "deactivateAccount"
  | "deleteAccount"
  | "deleteProject"
  | "deleteWebhookEndpoint"
  | "deleteBulk"
  | "deleteKeyword"
  | "clearTargetUrls"
  | "reactivateAccount"
  | "resetAccountLimits"
  | "revokeKey"
  | "revokeMigrationToken"
  | "rollMigrationToken"
  | "removeIntegration"
  | "removeSearchConsoleConnection"
  | "removeSampleData"
  | "removeTeamMember"
  | "transferProjectOwnership";

type ConfirmConfig = {
  title: string;
  body: string;
  icon: typeof Warning;
  dangerLabel: string;
  toastMessage: string;
  requireType?: boolean;
  typeWord?: string;
};

const MIGRATION_TOKEN_INVALIDATE_BODY =
  "This invalidates the current token. Any transfer using it will no longer work.";

export const CONFIRM: Record<ConfirmKind, ConfirmConfig> = {
  clearTargetUrls: {
    body: "Remove the configured target URL from the selected keywords. Ranking history is not affected.",
    dangerLabel: "Clear target URLs",
    icon: Warning,
    toastMessage: "Target URLs cleared",
    title: "Clear target URLs",
  },
  deactivateAccount: {
    body: "Deactivation will block sign-in and revoke every session. It will pause scheduled checks owned by this account. Every personal access token belonging to it will be permanently revoked. Instance administrators are protected.",
    dangerLabel: "Deactivate account",
    icon: UserMinus,
    toastMessage: "Account action requested",
    title: "Deactivate account",
  },
  deleteBulk: {
    body: "Remove the selected keywords and their history. This cannot be undone.",
    dangerLabel: "Delete keywords",
    icon: Trash,
    toastMessage: "Selected keywords deleted",
    title: "Delete selected keywords",
  },
  deleteKeyword: {
    body: "Stop tracking this keyword and remove its position history. This cannot be undone.",
    dangerLabel: "Delete keyword",
    icon: Trash,
    toastMessage: "Keyword deleted",
    title: "Delete keyword",
  },
  // Account deletion used to borrow the project copy, so the last thing a user read before
  // confirming described a different object than the one being destroyed.
  deleteAccount: {
    body: "This permanently deletes your account, your projects, and everything tracked in them. This cannot be undone.",
    dangerLabel: "Delete account",
    icon: Warning,
    requireType: true,
    toastMessage: "Account deleted",
    title: "Delete account",
    typeWord: "you@example.com",
  },
  deleteProject: {
    body: "This permanently deletes this project and all tracked keywords, history and API keys. This cannot be undone.",
    dangerLabel: "Delete project",
    icon: Warning,
    requireType: true,
    toastMessage: "Project deleted",
    title: "Delete project",
    typeWord: "acme.dev",
  },
  deleteWebhookEndpoint: {
    body: "Stop future deliveries to this endpoint and remove its delivery history association. This cannot be undone.",
    dangerLabel: "Delete endpoint",
    icon: Trash,
    toastMessage: "Webhook endpoint deleted",
    title: "Delete webhook endpoint",
  },
  removeIntegration: {
    body: "Rank checks will stop until another SERP provider is connected. Stored credentials are removed from this instance.",
    dangerLabel: "Disconnect provider",
    icon: Plugs,
    toastMessage: "Provider disconnected",
    title: "Disconnect provider",
  },
  removeSearchConsoleConnection: {
    body: "This removes the saved connection and authorization tokens from this project. Already imported Search Console metrics remain available.",
    dangerLabel: "Disconnect Search Console",
    icon: Plugs,
    toastMessage: "Search Console disconnected",
    title: "Disconnect Search Console",
  },
  removeSampleData: {
    body: "This deletes the sample project and its generated demo data. Your other projects are not affected.",
    dangerLabel: "Remove sample data",
    icon: Trash,
    toastMessage: "Sample data removed",
    title: "Remove sample data",
  },
  removeTeamMember: {
    body: "Remove this member from the project. Their account and access to other projects are not affected.",
    dangerLabel: "Remove member",
    icon: UserMinus,
    toastMessage: "Project member removed",
    title: "Remove project member",
  },
  reactivateAccount: {
    body: "Allow sign-in again. Previously revoked personal access tokens stay revoked and must be recreated. Scheduled checks will reconverge through the schedule reconciler.",
    dangerLabel: "Reactivate account",
    icon: UserPlus,
    toastMessage: "Account action requested",
    title: "Reactivate account",
  },
  resetAccountLimits: {
    body: "Clear this account's rate-limit buckets. Monthly spend is a rolling window and cannot be reset.",
    dangerLabel: "Reset rate limits",
    icon: Gauge,
    toastMessage: "Rate-limit reset requested",
    title: "Reset rate limits",
  },
  revokeKey: {
    body: "Any app or script using this key will stop working immediately. Generate a new key to restore access.",
    dangerLabel: "Revoke key",
    icon: Key,
    toastMessage: "API key revoked",
    title: "Revoke API key",
  },
  revokeMigrationToken: {
    body: MIGRATION_TOKEN_INVALIDATE_BODY,
    dangerLabel: "Revoke token",
    icon: Warning,
    toastMessage: "Migration token revoked",
    title: "Revoke migration token",
  },
  rollMigrationToken: {
    body: MIGRATION_TOKEN_INVALIDATE_BODY,
    dangerLabel: "Roll token",
    icon: Warning,
    toastMessage: "Token rolled",
    title: "Roll token",
  },
  transferProjectOwnership: {
    body: "Make this member the project owner. Your project role changes to admin, and only the new owner can transfer ownership again.",
    dangerLabel: "Transfer ownership",
    icon: CrownSimple,
    toastMessage: "Project ownership transferred",
    title: "Transfer project ownership",
  },
};
