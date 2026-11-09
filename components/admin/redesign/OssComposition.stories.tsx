import type { StoryObj } from "@storybook/react";
import { OssAdminComposition } from "./OssAdminComposition";
import {
  meta as baseMeta,
  DisabledWorker as fixtureDisabledWorker,
  Overview as fixtureOverview,
  UnknownWorker as fixtureUnknownWorker,
  WorkerBehind as fixtureWorkerBehind,
} from "./oss-story-fixtures-1";
import {
  AccountBlocked as fixtureAccountBlocked,
  AccountDeactivated as fixtureAccountDeactivated,
  AccountReactivated as fixtureAccountReactivated,
  Administration as fixtureAdministration,
  AdministrationLoading as fixtureAdministrationLoading,
  Audit as fixtureAudit,
  AuditLoading as fixtureAuditLoading,
  EmailSettings as fixtureEmailSettings,
  LookupRateLimit as fixtureLookupRateLimit,
  OperationsLoading as fixtureOperationsLoading,
  OpsPending as fixtureOpsPending,
  OpsUnconfigured as fixtureOpsUnconfigured,
  Polish as fixturePolish,
  ReactivateAccount as fixtureReactivateAccount,
  RecoveryBatch as fixtureRecoveryBatch,
  RecoveryDetail as fixtureRecoveryDetail,
  WorkerAhead as fixtureWorkerAhead,
  WorkerSchemaUnknown as fixtureWorkerSchemaUnknown,
} from "./oss-story-fixtures-2";
import {
  AccountFailed as fixtureAccountFailed,
  AccountForbidden as fixtureAccountForbidden,
  AccountLimited as fixtureAccountLimited,
  AccountLimitsCompleted as fixtureAccountLimitsCompleted,
  AccountLimitsFailed as fixtureAccountLimitsFailed,
  AccountTwoFactorRequired as fixtureAccountTwoFactorRequired,
  MailCleared as fixtureMailCleared,
  MailClearPending as fixtureMailClearPending,
  MailConfigured as fixtureMailConfigured,
  MailForbidden as fixtureMailForbidden,
  MailInvalid as fixtureMailInvalid,
  MailLimited as fixtureMailLimited,
  MailPending as fixtureMailPending,
  MailTwoFactor as fixtureMailTwoFactor,
  MailTwoFactorRequired as fixtureMailTwoFactorRequired,
  MailUnavailable as fixtureMailUnavailable,
} from "./oss-story-fixtures-3";
import {
  RecoveryBatchError as fixtureRecoveryBatchError,
  RecoveryBatchPending as fixtureRecoveryBatchPending,
  RecoveryClosedUnknown as fixtureRecoveryClosedUnknown,
  RecoveryCommandError as fixtureRecoveryCommandError,
  RecoveryCompleted as fixtureRecoveryCompleted,
  RecoveryEmpty as fixtureRecoveryEmpty,
  RecoveryError as fixtureRecoveryError,
  RecoveryFailed as fixtureRecoveryFailed,
  RecoveryFilters as fixtureRecoveryFilters,
  RecoveryLoading as fixtureRecoveryLoading,
  RecoveryParity as fixtureRecoveryParity,
  RecoveryPreview as fixtureRecoveryPreview,
  RecoveryQueued as fixtureRecoveryQueued,
  RecoveryRunning as fixtureRecoveryRunning,
  RecoverySelectionLimit as fixtureRecoverySelectionLimit,
  RecoveryStepUp as fixtureRecoveryStepUp,
  RecoveryTriageError as fixtureRecoveryTriageError,
  RecoveryUnavailable as fixtureRecoveryUnavailable,
  RecoveryWaiting as fixtureRecoveryWaiting,
} from "./oss-story-fixtures-4";
import {
  AccountLookupForbidden as fixtureAccountLookupForbidden,
  AdministrationBusy as fixtureAdministrationBusy,
  AdministrationFailed as fixtureAdministrationFailed,
  AdministrationForbidden as fixtureAdministrationForbidden,
  AdministrationNotFound as fixtureAdministrationNotFound,
  AuditParity as fixtureAuditParity,
  EmailConfigurationUnavailable as fixtureEmailConfigurationUnavailable,
  EmailCountsUnavailable as fixtureEmailCountsUnavailable,
  EmailNotConfigured as fixtureEmailNotConfigured,
  EmailParity as fixtureEmailParity,
  OverviewDisabled as fixtureOverviewDisabled,
  OverviewEmpty as fixtureOverviewEmpty,
  OverviewOpsFailed as fixtureOverviewOpsFailed,
  OverviewOpsForbidden as fixtureOverviewOpsForbidden,
  OverviewOpsNotConfigured as fixtureOverviewOpsNotConfigured,
  OverviewOpsRateLimited as fixtureOverviewOpsRateLimited,
  OverviewOpsThrown as fixtureOverviewOpsThrown,
  OverviewParity as fixtureOverviewParity,
  OverviewStale as fixtureOverviewStale,
  OverviewUnavailable as fixtureOverviewUnavailable,
} from "./oss-story-fixtures-5";
import {
  AccountLookupParity as fixtureAccountLookupParity,
  MailSaveParity as fixtureMailSaveParity,
  OverviewSort as fixtureOverviewSort,
} from "./oss-story-fixtures-6";
import { AuditSort as fixtureAuditSort } from "./oss-story-fixtures-7";
import {
  AuditActorTie as fixtureAuditActorTie,
  AuditTargetTie as fixtureAuditTargetTie,
  EmailSendingToday as fixtureEmailSendingToday,
  OperationsChecks as fixtureOperationsChecks,
  OperationsDataSources as fixtureOperationsDataSources,
  OperationsNotifications as fixtureOperationsNotifications,
  OperationsTasks as fixtureOperationsTasks,
  OperationsWorker as fixtureOperationsWorker,
  RecoveryDatesTie as fixtureRecoveryDatesTie,
  RecoverySort as fixtureRecoverySort,
  UsersAccounts as fixtureUsersAccounts,
} from "./oss-story-fixtures-8";

const meta = {
  ...baseMeta,
  title: "Admin redesign/OSS composition",
  component: OssAdminComposition,
};
export default meta;
function atPage(story: StoryObj<typeof meta>, tab: string, view: string): StoryObj<typeof meta> {
  return { ...story, args: { ...story.args, initialTab: tab, initialView: view } };
}
export const Overview = fixtureOverview;
export const DisabledWorker = atPage(fixtureDisabledWorker, "Operations", "Worker");
export const UnknownWorker = atPage(fixtureUnknownWorker, "Operations", "Worker");
export const WorkerBehind = atPage(fixtureWorkerBehind, "Operations", "Worker");
export const WorkerAhead = atPage(fixtureWorkerAhead, "Operations", "Worker");
export const WorkerSchemaUnknown = atPage(fixtureWorkerSchemaUnknown, "Operations", "Worker");
export const OpsUnconfigured = atPage(fixtureOpsUnconfigured, "Operations", "Notifications");
export const OpsPending = atPage(fixtureOpsPending, "Operations", "Notifications");
export const Audit = fixtureAudit;
export const OperationsLoading = fixtureOperationsLoading;
export const AdministrationLoading = fixtureAdministrationLoading;
export const RecoveryDetail = atPage(fixtureRecoveryDetail, "Operations", "Tasks");
export const RecoveryBatch = atPage(fixtureRecoveryBatch, "Operations", "Tasks");
export const Polish = fixturePolish;
export const AuditLoading = fixtureAuditLoading;
export const Administration = atPage(fixtureAdministration, "Users", "Accounts");
export const EmailSettings = atPage(fixtureEmailSettings, "Email", "Settings");
export const ReactivateAccount = fixtureReactivateAccount;
export const LookupRateLimit = fixtureLookupRateLimit;
export const AccountDeactivated = atPage(fixtureAccountDeactivated, "Users", "Accounts");
export const AccountReactivated = atPage(fixtureAccountReactivated, "Users", "Accounts");
export const AccountBlocked = atPage(fixtureAccountBlocked, "Users", "Accounts");
export const AccountForbidden = atPage(fixtureAccountForbidden, "Users", "Accounts");
export const AccountLimited = atPage(fixtureAccountLimited, "Users", "Accounts");
export const AccountFailed = atPage(fixtureAccountFailed, "Users", "Accounts");
export const AccountLimitsCompleted = atPage(fixtureAccountLimitsCompleted, "Users", "Accounts");
export const AccountLimitsFailed = atPage(fixtureAccountLimitsFailed, "Users", "Accounts");
export const MailConfigured = atPage(fixtureMailConfigured, "Email", "Settings");
export const MailCleared = atPage(fixtureMailCleared, "Email", "Settings");
export const MailForbidden = atPage(fixtureMailForbidden, "Email", "Settings");
export const MailLimited = atPage(fixtureMailLimited, "Email", "Settings");
export const MailTwoFactor = atPage(fixtureMailTwoFactor, "Email", "Settings");
export const MailUnavailable = atPage(fixtureMailUnavailable, "Email", "Settings");
export const MailInvalid = atPage(fixtureMailInvalid, "Email", "Settings");
export const MailPending = atPage(fixtureMailPending, "Email", "Settings");
export const MailClearPending = atPage(fixtureMailClearPending, "Email", "Settings");
export const MailTwoFactorRequired = atPage(fixtureMailTwoFactorRequired, "Email", "Settings");
export const AccountTwoFactorRequired = atPage(
  fixtureAccountTwoFactorRequired,
  "Users",
  "Accounts",
);
export const RecoveryParity = atPage(fixtureRecoveryParity, "Operations", "Tasks");
export const RecoverySelectionLimit = atPage(fixtureRecoverySelectionLimit, "Operations", "Tasks");
export const RecoveryEmpty = atPage(fixtureRecoveryEmpty, "Operations", "Tasks");
export const RecoveryUnavailable = atPage(fixtureRecoveryUnavailable, "Operations", "Tasks");
export const RecoveryLoading = atPage(fixtureRecoveryLoading, "Operations", "Tasks");
export const RecoveryError = atPage(fixtureRecoveryError, "Operations", "Tasks");
export const RecoveryCommandError = atPage(fixtureRecoveryCommandError, "Operations", "Tasks");
export const RecoveryQueued = atPage(fixtureRecoveryQueued, "Operations", "Tasks");
export const RecoveryCompleted = atPage(fixtureRecoveryCompleted, "Operations", "Tasks");
export const RecoveryTriageError = atPage(fixtureRecoveryTriageError, "Operations", "Tasks");
export const RecoveryPreview = atPage(fixtureRecoveryPreview, "Operations", "Tasks");
export const RecoveryStepUp = atPage(fixtureRecoveryStepUp, "Operations", "Tasks");
export const RecoveryBatchError = atPage(fixtureRecoveryBatchError, "Operations", "Tasks");
export const RecoveryBatchPending = atPage(fixtureRecoveryBatchPending, "Operations", "Tasks");
export const RecoveryFilters = atPage(fixtureRecoveryFilters, "Operations", "Tasks");
export const RecoveryRunning = atPage(fixtureRecoveryRunning, "Operations", "Tasks");
export const RecoveryFailed = atPage(fixtureRecoveryFailed, "Operations", "Tasks");
export const RecoveryClosedUnknown = atPage(fixtureRecoveryClosedUnknown, "Operations", "Tasks");
export const RecoveryWaiting = atPage(fixtureRecoveryWaiting, "Operations", "Tasks");
export const OverviewParity = fixtureOverviewParity;
export const OverviewUnavailable = fixtureOverviewUnavailable;
export const OverviewEmpty = fixtureOverviewEmpty;
export const OverviewStale = fixtureOverviewStale;
export const OverviewDisabled = fixtureOverviewDisabled;
export const OverviewOpsNotConfigured = atPage(
  fixtureOverviewOpsNotConfigured,
  "Operations",
  "Notifications",
);
export const OverviewOpsRateLimited = atPage(
  fixtureOverviewOpsRateLimited,
  "Operations",
  "Notifications",
);
export const OverviewOpsFailed = atPage(fixtureOverviewOpsFailed, "Operations", "Notifications");
export const OverviewOpsForbidden = atPage(
  fixtureOverviewOpsForbidden,
  "Operations",
  "Notifications",
);
export const EmailParity = fixtureEmailParity;
export const EmailNotConfigured = fixtureEmailNotConfigured;
export const EmailCountsUnavailable = fixtureEmailCountsUnavailable;
export const EmailConfigurationUnavailable = fixtureEmailConfigurationUnavailable;
export const OverviewOpsThrown = atPage(fixtureOverviewOpsThrown, "Operations", "Notifications");
export const AdministrationBusy = atPage(fixtureAdministrationBusy, "Users", "Accounts");
export const AdministrationNotFound = atPage(fixtureAdministrationNotFound, "Users", "Accounts");
export const AdministrationFailed = atPage(fixtureAdministrationFailed, "Users", "Accounts");
export const AdministrationForbidden = atPage(fixtureAdministrationForbidden, "Users", "Accounts");
export const AccountLookupForbidden = atPage(fixtureAccountLookupForbidden, "Users", "Accounts");
export const AuditParity = fixtureAuditParity;
export const AccountLookupParity = atPage(fixtureAccountLookupParity, "Users", "Accounts");
export const MailSaveParity = atPage(fixtureMailSaveParity, "Email", "Settings");
export const OverviewSort = fixtureOverviewSort;
export const AuditSort = fixtureAuditSort;
export const RecoverySort = atPage(fixtureRecoverySort, "Operations", "Tasks");
export const AuditTargetTie = fixtureAuditTargetTie;
export const AuditActorTie = fixtureAuditActorTie;
export const RecoveryDatesTie = atPage(fixtureRecoveryDatesTie, "Operations", "Tasks");
export const OperationsWorker = fixtureOperationsWorker;
export const OperationsChecks = fixtureOperationsChecks;
export const OperationsDataSources = fixtureOperationsDataSources;
export const OperationsTasks = fixtureOperationsTasks;
export const OperationsNotifications = fixtureOperationsNotifications;
export const UsersAccounts = fixtureUsersAccounts;
export const EmailSendingToday = fixtureEmailSendingToday;
export const WorkerUnavailable = atPage(fixtureOverviewUnavailable, "Operations", "Worker");
export const ChecksUnavailable = atPage(fixtureOverviewUnavailable, "Operations", "Checks");
export const DataSourcesUnavailable = atPage(
  fixtureOverviewUnavailable,
  "Operations",
  "Data sources",
);
export const NotificationsUnavailable = atPage(
  fixtureOverviewUnavailable,
  "Operations",
  "Notifications",
);

export {
  DeactivatedAccount,
  EmptyAccounts,
  LoadingAccounts,
  ManyAccounts,
  UnavailableAccounts,
} from "./oss-account-stories.test-fixture";
