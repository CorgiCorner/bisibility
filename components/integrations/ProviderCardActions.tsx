"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { Button } from "@/components/ui/Button";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";
import type { Notice } from "./ConnectDrawerSchema";
import { ProviderCardDisconnectMenu } from "./ProviderCardDisconnectMenu";
import { providerCardActions } from "./provider-card-actions";
import { outlineActionStyle } from "./provider-card-config";

type Props = {
  actions?: ProviderActionHandlers;
  canManageProviders: boolean;
  onManage: () => void;
  onDisconnected: () => void;
  onNotice: (notice: Notice | null) => void;
  onSecondaryAction: () => Promise<void>;
  onSync: () => Promise<void>;
  projectId?: string;
  provider: IntegrationProviderData;
  readOnly: boolean;
  showSync: boolean;
  syncPending: boolean;
  testPending: boolean;
};

export function ProviderCardActions(props: Readonly<Props>) {
  const { provider, canManageProviders, readOnly, testPending, syncPending } = props;
  const t = useTranslations("projectIntegrations.provider");
  const { isHostedSerp, keyRemoval, managementActionKey } = providerCardActions(provider);
  if (isHostedSerp || (!canManageProviders && !props.showSync)) return null;
  const connected = provider.status === "connected";
  const buttonClass = "min-h-11 sm:min-h-[30px]";
  return (
    <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2" data-provider-actions="">
      {provider.secondaryAction && canManageProviders && !connected ? (
        <ProjectReadOnlyTooltip className="inline-flex">
          <Button
            className={buttonClass}
            disabled={readOnly || testPending}
            onClick={() => void props.onSecondaryAction()}
            size="xs"
            style={outlineActionStyle}
            variant="secondary"
          >
            {testPending
              ? t("testing")
              : provider.secondaryAction === "Test"
                ? t("test")
                : provider.secondaryAction}
          </Button>
        </ProjectReadOnlyTooltip>
      ) : null}
      {props.showSync ? (
        <ProjectReadOnlyTooltip className="inline-flex">
          <Button
            className={buttonClass}
            disabled={readOnly || syncPending}
            onClick={() => void props.onSync()}
            size="xs"
            style={outlineActionStyle}
            variant="secondary"
          >
            {syncPending ? t("syncing") : t("syncNow")}
          </Button>
        </ProjectReadOnlyTooltip>
      ) : null}
      {canManageProviders ? (
        <ProjectReadOnlyTooltip className="inline-flex">
          <Button
            className={buttonClass}
            disabled={readOnly && !connected}
            onClick={props.onManage}
            size="xs"
            style={connected ? outlineActionStyle : undefined}
            variant={connected ? "secondary" : "primary"}
          >
            {connected
              ? t(managementActionKey)
              : provider.status === "needs_reauth"
                ? t("reconnect")
                : t("connect")}
          </Button>
        </ProjectReadOnlyTooltip>
      ) : null}
      {connected && canManageProviders ? (
        <div className="ml-auto">
          <ProviderCardDisconnectMenu
            disconnectProvider={props.actions?.disconnectProvider}
            hasTest={Boolean(provider.secondaryAction)}
            onDisconnected={props.onDisconnected}
            onNotice={props.onNotice}
            onTest={() => void props.onSecondaryAction()}
            projectId={props.projectId ?? "prj_storybook"}
            providerId={
              provider.id as Parameters<
                ProviderActionHandlers["testProviderConnection"]
              >[0]["providerId"]
            }
            providerName={provider.name}
            readOnly={readOnly}
            testPending={testPending}
            keyRemoval={keyRemoval}
          />
        </div>
      ) : null}
    </div>
  );
}
