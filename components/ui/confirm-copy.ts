import { CrownSimpleIcon as CrownSimple } from "@phosphor-icons/react/dist/csr/CrownSimple";
import { GaugeIcon as Gauge } from "@phosphor-icons/react/dist/csr/Gauge";
import { KeyIcon as Key } from "@phosphor-icons/react/dist/csr/Key";
import { PlugsIcon as Plugs } from "@phosphor-icons/react/dist/csr/Plugs";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { UserMinusIcon as UserMinus } from "@phosphor-icons/react/dist/csr/UserMinus";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/dist/csr/UserPlus";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/csr/Warning";
import type { useTranslations } from "next-intl";

type ConfirmMessageKey =
  | "clearTargetUrls"
  | "deactivateAccount"
  | "deleteAccount"
  | "deleteAlertRule"
  | "deleteBulk"
  | "deleteKeyword"
  | "deleteProject"
  | "deleteRun"
  | "deleteTimelineNote"
  | "deleteWebhookEndpoint"
  | "reactivateAccount"
  | "removeIntegration"
  | "removeProviderKey"
  | "removeSampleData"
  | "removeSearchConsoleConnection"
  | "removeTeamMember"
  | "resetAccountLimits"
  | "revokeKey"
  | "revokeMigrationToken"
  | "rollMigrationToken"
  | "transferProjectOwnership";

type ConfirmConfig = {
  icon: typeof Warning;
  requireType?: boolean;
  typeWord?: string;
};

export const CONFIRM: Record<ConfirmMessageKey, ConfirmConfig> = {
  clearTargetUrls: { icon: Warning },
  deactivateAccount: { icon: UserMinus },
  deleteAccount: { icon: Warning, requireType: true, typeWord: "you@example.com" },
  deleteAlertRule: { icon: Trash },
  deleteBulk: { icon: Trash },
  deleteKeyword: { icon: Trash },
  deleteProject: { icon: Warning, requireType: true, typeWord: "acme.dev" },
  deleteRun: { icon: Trash },
  deleteTimelineNote: { icon: Trash },
  deleteWebhookEndpoint: { icon: Trash },
  reactivateAccount: { icon: UserPlus },
  removeIntegration: { icon: Plugs },
  removeProviderKey: { icon: Key },
  removeSampleData: { icon: Trash },
  removeSearchConsoleConnection: { icon: Plugs },
  removeTeamMember: { icon: UserMinus },
  resetAccountLimits: { icon: Gauge },
  revokeKey: { icon: Key },
  revokeMigrationToken: { icon: Warning },
  rollMigrationToken: { icon: Warning },
  transferProjectOwnership: { icon: CrownSimple },
};

export type ConfirmKind = keyof typeof CONFIRM;

type ConfirmationTranslator = ReturnType<typeof useTranslations<"shared.controls.confirmation">>;

export function confirmCopy(kind: ConfirmKind, t: ConfirmationTranslator) {
  switch (kind) {
    case "clearTargetUrls":
      return {
        body: t("clearTargetUrlsBody"),
        dangerLabel: t("clearTargetUrlsDangerLabel"),
        title: t("clearTargetUrlsTitle"),
        toastMessage: t("clearTargetUrlsToastMessage"),
      };
    case "deactivateAccount":
      return {
        body: t("deactivateAccountBody"),
        dangerLabel: t("deactivateAccountDangerLabel"),
        title: t("deactivateAccountTitle"),
        toastMessage: t("deactivateAccountToastMessage"),
      };
    case "deleteAccount":
      return {
        body: t("deleteAccountBody"),
        dangerLabel: t("deleteAccountDangerLabel"),
        title: t("deleteAccountTitle"),
        toastMessage: t("deleteAccountToastMessage"),
      };
    case "deleteAlertRule":
      return {
        body: t("deleteAlertRuleBody"),
        dangerLabel: t("deleteAlertRuleDangerLabel"),
        title: t("deleteAlertRuleTitle"),
        toastMessage: t("deleteAlertRuleToastMessage"),
      };
    case "deleteBulk":
      return {
        body: t("deleteBulkBody"),
        dangerLabel: t("deleteBulkDangerLabel"),
        title: t("deleteBulkTitle"),
        toastMessage: t("deleteBulkToastMessage"),
      };
    case "deleteKeyword":
      return {
        body: t("deleteKeywordBody"),
        dangerLabel: t("deleteKeywordDangerLabel"),
        title: t("deleteKeywordTitle"),
        toastMessage: t("deleteKeywordToastMessage"),
      };
    case "deleteProject":
      return {
        body: t("deleteProjectBody"),
        dangerLabel: t("deleteProjectDangerLabel"),
        title: t("deleteProjectTitle"),
        toastMessage: t("deleteProjectToastMessage"),
      };
    case "deleteRun":
      return {
        body: t("deleteRunBody"),
        dangerLabel: t("deleteRunDangerLabel"),
        title: t("deleteRunTitle"),
        toastMessage: t("deleteRunToastMessage"),
      };
    case "deleteTimelineNote":
      return {
        body: t("deleteTimelineNoteBody"),
        dangerLabel: t("deleteTimelineNoteDangerLabel"),
        title: t("deleteTimelineNoteTitle"),
        toastMessage: t("deleteTimelineNoteToastMessage"),
      };
    case "deleteWebhookEndpoint":
      return {
        body: t("deleteWebhookEndpointBody"),
        dangerLabel: t("deleteWebhookEndpointDangerLabel"),
        title: t("deleteWebhookEndpointTitle"),
        toastMessage: t("deleteWebhookEndpointToastMessage"),
      };
    case "reactivateAccount":
      return {
        body: t("reactivateAccountBody"),
        dangerLabel: t("reactivateAccountDangerLabel"),
        title: t("reactivateAccountTitle"),
        toastMessage: t("reactivateAccountToastMessage"),
      };
    case "removeIntegration":
      return {
        body: t("removeIntegrationBody"),
        dangerLabel: t("removeIntegrationDangerLabel"),
        title: t("removeIntegrationTitle"),
        toastMessage: t("removeIntegrationToastMessage"),
      };
    case "removeProviderKey":
      return {
        body: t("removeProviderKeyBody"),
        dangerLabel: t("removeProviderKeyDangerLabel"),
        title: t("removeProviderKeyTitle"),
        toastMessage: t("removeProviderKeyToastMessage"),
      };
    case "removeSampleData":
      return {
        body: t("removeSampleDataBody"),
        dangerLabel: t("removeSampleDataDangerLabel"),
        title: t("removeSampleDataTitle"),
        toastMessage: t("removeSampleDataToastMessage"),
      };
    case "removeSearchConsoleConnection":
      return {
        body: t("removeSearchConsoleConnectionBody"),
        dangerLabel: t("removeSearchConsoleConnectionDangerLabel"),
        title: t("removeSearchConsoleConnectionTitle"),
        toastMessage: t("removeSearchConsoleConnectionToastMessage"),
      };
    case "removeTeamMember":
      return {
        body: t("removeTeamMemberBody"),
        dangerLabel: t("removeTeamMemberDangerLabel"),
        title: t("removeTeamMemberTitle"),
        toastMessage: t("removeTeamMemberToastMessage"),
      };
    case "resetAccountLimits":
      return {
        body: t("resetAccountLimitsBody"),
        dangerLabel: t("resetAccountLimitsDangerLabel"),
        title: t("resetAccountLimitsTitle"),
        toastMessage: t("resetAccountLimitsToastMessage"),
      };
    case "revokeKey":
      return {
        body: t("revokeKeyBody"),
        dangerLabel: t("revokeKeyDangerLabel"),
        title: t("revokeKeyTitle"),
        toastMessage: t("revokeKeyToastMessage"),
      };
    case "revokeMigrationToken":
      return {
        body: t("revokeMigrationTokenBody"),
        dangerLabel: t("revokeMigrationTokenDangerLabel"),
        title: t("revokeMigrationTokenTitle"),
        toastMessage: t("revokeMigrationTokenToastMessage"),
      };
    case "rollMigrationToken":
      return {
        body: t("rollMigrationTokenBody"),
        dangerLabel: t("rollMigrationTokenDangerLabel"),
        title: t("rollMigrationTokenTitle"),
        toastMessage: t("rollMigrationTokenToastMessage"),
      };
    case "transferProjectOwnership":
      return {
        body: t("transferProjectOwnershipBody"),
        dangerLabel: t("transferProjectOwnershipDangerLabel"),
        title: t("transferProjectOwnershipTitle"),
        toastMessage: t("transferProjectOwnershipToastMessage"),
      };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}
