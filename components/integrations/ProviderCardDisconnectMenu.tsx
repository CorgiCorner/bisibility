"use client";

import type { Notice } from "@/components/integrations/ConnectDrawerSchema";
import { ProviderDisconnectAction } from "@/components/integrations/ProviderDisconnectAction";
import { DeveloperActionsMenu } from "@/components/settings/developers/DeveloperActionsMenu";
import type { ProviderActionHandlers } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";

type ProviderId = Parameters<ProviderActionHandlers["testProviderConnection"]>[0]["providerId"];

export function ProviderCardDisconnectMenu({
  disconnectProvider,
  hasTest,
  onDisconnected,
  onNotice,
  onTest,
  projectId,
  providerId,
  providerName,
  readOnly,
  testPending,
}: Readonly<{
  disconnectProvider?: ProviderActionHandlers["disconnectProvider"];
  hasTest: boolean;
  onDisconnected: () => void;
  onNotice: (notice: Notice | null) => void;
  onTest: () => void;
  projectId: string;
  providerId: ProviderId;
  providerName: string;
  readOnly: boolean;
  testPending: boolean;
}>) {
  const t = useTranslations("projectIntegrations.provider");

  return (
    <ProviderDisconnectAction
      disconnectProvider={disconnectProvider}
      onDisconnected={onDisconnected}
      onNotice={onNotice}
      projectId={projectId}
      providerId={providerId}
      renderTrigger={({ disabled, onOpen }) => (
        <DeveloperActionsMenu
          ariaLabel={t("actions", { provider: providerName })}
          items={[
            ...(hasTest
              ? [
                  {
                    disabled: readOnly || testPending,
                    label: testPending ? t("testing") : t("test"),
                    onSelect: onTest,
                  },
                ]
              : []),
            { danger: true, disabled, label: t("disconnect"), onSelect: onOpen },
          ]}
        />
      )}
    />
  );
}
