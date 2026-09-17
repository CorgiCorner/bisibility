import type { CoreMessages } from "@/i18n/core-messages.generated";
import { CrownSimpleIcon as CrownSimple } from "@phosphor-icons/react/dist/csr/CrownSimple";
import { GaugeIcon as Gauge } from "@phosphor-icons/react/dist/csr/Gauge";
import { KeyIcon as Key } from "@phosphor-icons/react/dist/csr/Key";
import { PlugsIcon as Plugs } from "@phosphor-icons/react/dist/csr/Plugs";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { UserMinusIcon as UserMinus } from "@phosphor-icons/react/dist/csr/UserMinus";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/dist/csr/UserPlus";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/csr/Warning";

type ConfirmMessageKey =
  | "clearTargetUrls"
  | "deactivateAccount"
  | "deleteAccount"
  | "deleteBulk"
  | "deleteKeyword"
  | "deleteProject"
  | "deleteRun"
  | "deleteWebhookEndpoint"
  | "reactivateAccount"
  | "removeIntegration"
  | "removeSampleData"
  | "removeSearchConsoleConnection"
  | "removeTeamMember"
  | "resetAccountLimits"
  | "revokeKey"
  | "revokeMigrationToken"
  | "rollMigrationToken"
  | "transferProjectOwnership";

type ConfirmationMessageKey = keyof CoreMessages["shared"]["controls"]["confirmation"];
type ConfirmBodyKey = Extract<ConfirmationMessageKey, `${ConfirmMessageKey}Body`>;
type ConfirmDangerLabelKey = Extract<ConfirmationMessageKey, `${ConfirmMessageKey}DangerLabel`>;
type ConfirmTitleKey = Extract<ConfirmationMessageKey, `${ConfirmMessageKey}Title`>;
type ConfirmToastMessageKey = Extract<ConfirmationMessageKey, `${ConfirmMessageKey}ToastMessage`>;

type ConfirmConfig = {
  icon: typeof Warning;
  bodyKey: ConfirmBodyKey;
  dangerLabelKey: ConfirmDangerLabelKey;
  titleKey: ConfirmTitleKey;
  toastMessageKey: ConfirmToastMessageKey;
  requireType?: boolean;
  typeWord?: string;
};

export const CONFIRM: Record<ConfirmMessageKey, ConfirmConfig> = {
  clearTargetUrls: {
    icon: Warning,
    bodyKey: "clearTargetUrlsBody",
    dangerLabelKey: "clearTargetUrlsDangerLabel",
    titleKey: "clearTargetUrlsTitle",
    toastMessageKey: "clearTargetUrlsToastMessage",
  },
  deactivateAccount: {
    icon: UserMinus,
    bodyKey: "deactivateAccountBody",
    dangerLabelKey: "deactivateAccountDangerLabel",
    titleKey: "deactivateAccountTitle",
    toastMessageKey: "deactivateAccountToastMessage",
  },
  deleteAccount: {
    icon: Warning,
    bodyKey: "deleteAccountBody",
    dangerLabelKey: "deleteAccountDangerLabel",
    titleKey: "deleteAccountTitle",
    toastMessageKey: "deleteAccountToastMessage",
    requireType: true,
    typeWord: "you@example.com",
  },
  deleteBulk: {
    icon: Trash,
    bodyKey: "deleteBulkBody",
    dangerLabelKey: "deleteBulkDangerLabel",
    titleKey: "deleteBulkTitle",
    toastMessageKey: "deleteBulkToastMessage",
  },
  deleteKeyword: {
    icon: Trash,
    bodyKey: "deleteKeywordBody",
    dangerLabelKey: "deleteKeywordDangerLabel",
    titleKey: "deleteKeywordTitle",
    toastMessageKey: "deleteKeywordToastMessage",
  },
  deleteProject: {
    icon: Warning,
    bodyKey: "deleteProjectBody",
    dangerLabelKey: "deleteProjectDangerLabel",
    titleKey: "deleteProjectTitle",
    toastMessageKey: "deleteProjectToastMessage",
    requireType: true,
    typeWord: "acme.dev",
  },
  deleteRun: {
    icon: Trash,
    bodyKey: "deleteRunBody",
    dangerLabelKey: "deleteRunDangerLabel",
    titleKey: "deleteRunTitle",
    toastMessageKey: "deleteRunToastMessage",
  },
  deleteWebhookEndpoint: {
    icon: Trash,
    bodyKey: "deleteWebhookEndpointBody",
    dangerLabelKey: "deleteWebhookEndpointDangerLabel",
    titleKey: "deleteWebhookEndpointTitle",
    toastMessageKey: "deleteWebhookEndpointToastMessage",
  },
  reactivateAccount: {
    icon: UserPlus,
    bodyKey: "reactivateAccountBody",
    dangerLabelKey: "reactivateAccountDangerLabel",
    titleKey: "reactivateAccountTitle",
    toastMessageKey: "reactivateAccountToastMessage",
  },
  removeIntegration: {
    icon: Plugs,
    bodyKey: "removeIntegrationBody",
    dangerLabelKey: "removeIntegrationDangerLabel",
    titleKey: "removeIntegrationTitle",
    toastMessageKey: "removeIntegrationToastMessage",
  },
  removeSampleData: {
    icon: Trash,
    bodyKey: "removeSampleDataBody",
    dangerLabelKey: "removeSampleDataDangerLabel",
    titleKey: "removeSampleDataTitle",
    toastMessageKey: "removeSampleDataToastMessage",
  },
  removeSearchConsoleConnection: {
    icon: Plugs,
    bodyKey: "removeSearchConsoleConnectionBody",
    dangerLabelKey: "removeSearchConsoleConnectionDangerLabel",
    titleKey: "removeSearchConsoleConnectionTitle",
    toastMessageKey: "removeSearchConsoleConnectionToastMessage",
  },
  removeTeamMember: {
    icon: UserMinus,
    bodyKey: "removeTeamMemberBody",
    dangerLabelKey: "removeTeamMemberDangerLabel",
    titleKey: "removeTeamMemberTitle",
    toastMessageKey: "removeTeamMemberToastMessage",
  },
  resetAccountLimits: {
    icon: Gauge,
    bodyKey: "resetAccountLimitsBody",
    dangerLabelKey: "resetAccountLimitsDangerLabel",
    titleKey: "resetAccountLimitsTitle",
    toastMessageKey: "resetAccountLimitsToastMessage",
  },
  revokeKey: {
    icon: Key,
    bodyKey: "revokeKeyBody",
    dangerLabelKey: "revokeKeyDangerLabel",
    titleKey: "revokeKeyTitle",
    toastMessageKey: "revokeKeyToastMessage",
  },
  revokeMigrationToken: {
    icon: Warning,
    bodyKey: "revokeMigrationTokenBody",
    dangerLabelKey: "revokeMigrationTokenDangerLabel",
    titleKey: "revokeMigrationTokenTitle",
    toastMessageKey: "revokeMigrationTokenToastMessage",
  },
  rollMigrationToken: {
    icon: Warning,
    bodyKey: "rollMigrationTokenBody",
    dangerLabelKey: "rollMigrationTokenDangerLabel",
    titleKey: "rollMigrationTokenTitle",
    toastMessageKey: "rollMigrationTokenToastMessage",
  },
  transferProjectOwnership: {
    icon: CrownSimple,
    bodyKey: "transferProjectOwnershipBody",
    dangerLabelKey: "transferProjectOwnershipDangerLabel",
    titleKey: "transferProjectOwnershipTitle",
    toastMessageKey: "transferProjectOwnershipToastMessage",
  },
};

export type ConfirmKind = keyof typeof CONFIRM;
