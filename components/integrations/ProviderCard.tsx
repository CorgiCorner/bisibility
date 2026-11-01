"use client";
import { ConnectDrawer } from "@/components/integrations/ConnectDrawer";
import { ProviderCredentialWarning } from "@/components/integrations/ProviderCredentialWarning";
import { ProviderSyncFailureAlert } from "@/components/integrations/ProviderSyncFailureAlert";
import { ProviderRecovery } from "@/components/integrations/provider-recovery/ProviderRecovery";
import { ProviderDataSourceSlot } from "@/components/settings/AccountDataSourceSlot";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Card } from "@/components/ui/Card";
import { testConnection as testConnectionAction } from "@/lib/actions/providers";
import type { ProviderActionHandlers, ProviderTestResult } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Notice } from "./ConnectDrawerSchema";
import type { ProviderCardProps } from "./ProviderCard.types";
import { ProviderCardActions } from "./ProviderCardActions";
import { ProviderCardDescription } from "./ProviderCardDescription";
import { ProviderCardFeedback } from "./ProviderCardFeedback";
import { ProviderCardHeader } from "./ProviderCardHeader";
import { ProviderCardMeta } from "./ProviderCardMeta";
import { ProviderConsumerRows } from "./ProviderConsumerRows";

export type { ProviderCardProps } from "./ProviderCard.types";

import { providerCardActions } from "./provider-card-actions";
import { providerConsumerStatuses, reauthMessageKey } from "./provider-card-config";
import { useProviderTrafficSync } from "./useProviderTrafficSync";

type ProviderId = Parameters<ProviderActionHandlers["testProviderConnection"]>[0]["providerId"];
const demoTestConnection = async (): Promise<ProviderTestResult> => ({
  balance: 41_200,
  message: "Connection OK",
  ok: true,
});
export function ProviderCard({
  actions,
  canManageProviders,
  canUpdateProject,
  consumerDetails = "inline",
  deploymentMode,
  initialOpen = false,
  projectId,
  projectRef,
  provider,
  searchSyncPlan,
  timeZone,
}: Readonly<ProviderCardProps>) {
  const t = useTranslations("projectIntegrations.provider");
  const tIntegrations = useTranslations("projectIntegrations");
  const [drawerOpen, setDrawerOpen] = useState(initialOpen && canManageProviders);
  const [testPending, setTestPending] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [disconnectNotice, setDisconnectNotice] = useState<Notice | null>(null);
  const { readOnly } = useProjectWriteMode();
  const { isHostedSerp, managementActionKey } = providerCardActions(provider);
  const managementActionLabel = t(managementActionKey);
  const canSync =
    provider.kind === "analytics" && provider.status === "connected" && provider.enabled !== false;
  const consumerStatuses = providerConsumerStatuses(provider);
  const hasConsumerRows = Boolean(consumerStatuses);
  const testProviderConnection =
    actions?.testProviderConnection ?? (projectId ? testConnectionAction : demoTestConnection);
  const { handleTrafficSync, syncPending, syncResult } = useProviderTrafficSync({
    messages: {
      failed: t("trafficFailed"),
      noSource: t("trafficNoSource"),
      updated: (keywords, pages) => t("trafficUpdated", { keywords, pages }),
    },
    projectId,
    readOnly,
    syncProjectTraffic: actions?.syncProjectTraffic,
  });
  const showFooter =
    (canManageProviders && !isHostedSerp) ||
    (provider.kind === "serp" && canManageProviders) ||
    (canSync && canUpdateProject && !hasConsumerRows) ||
    Boolean(
      disconnectNotice || testResult || (!hasConsumerRows && (provider.neverSynced || syncResult)),
    );
  async function handleSecondaryAction() {
    if (readOnly) return;
    if (provider.secondaryAction !== "Test") {
      setDrawerOpen(true);
      return;
    }
    setTestPending(true);
    setTestResult(null);
    try {
      setTestResult(
        await testProviderConnection({
          projectId: projectId ?? "prj_storybook",
          providerId: provider.id as ProviderId,
        }),
      );
    } catch (error) {
      setTestResult({
        message: error instanceof Error ? error.message : t("connectionTestFailed"),
        ok: false,
      });
    } finally {
      setTestPending(false);
    }
  }
  return (
    <>
      <Card
        id={`provider-${provider.id}`}
        className="row-span-3 grid min-w-0 grid-rows-subgrid p-4"
        size="md"
        style={{ opacity: provider.status === "planned" ? 0.92 : 1 }}
      >
        <ProviderCardHeader canManageProviders={canManageProviders} provider={provider} />
        <div className="min-w-0" data-provider-details="">
          {provider.recovery && projectId && provider.connectionId ? (
            <ProviderRecovery
              key={provider.recovery.revision}
              initial={provider.recovery}
              providerName={provider.name}
              accountUrl={provider.accountUrl}
              projectId={projectId}
              connectionId={provider.connectionId}
              canManage={canManageProviders && !readOnly}
            />
          ) : (
            <ProviderCardDescription provider={provider} />
          )}

          {consumerStatuses && consumerDetails === "inline" ? (
            <ProviderConsumerRows
              canSync={canSync && canUpdateProject}
              onSync={() => void handleTrafficSync()}
              projectRef={projectRef}
              readOnly={readOnly}
              statuses={consumerStatuses}
              syncFailure={provider.syncFailure}
              syncPending={syncPending}
              syncResult={syncResult}
              timeZone={timeZone}
            />
          ) : provider.recovery ? null : (
            <ProviderCardMeta
              provider={
                consumerStatuses
                  ? {
                      ...provider,
                      meta: consumerStatuses.searchModule.detail
                        ? [
                            {
                              labelKey: "property" as const,
                              value: consumerStatuses.searchModule.detail,
                            },
                          ]
                        : [],
                    }
                  : provider
              }
            />
          )}
          {provider.status === "needs_reauth" ? (
            <p
              className="m-0 mt-3 rounded-control border border-red bg-red/5 px-3 py-2 text-[12.5px] leading-[1.45] text-red-text"
              role="alert"
            >
              {tIntegrations(reauthMessageKey(provider))}
            </p>
          ) : null}
          <ProviderCredentialWarning credentialIssue={provider.credentialIssue} />
          {!hasConsumerRows && provider.syncFailure ? (
            <ProviderSyncFailureAlert
              failure={provider.syncFailure}
              managementActionLabel={managementActionLabel}
              timeZone={timeZone}
            />
          ) : null}
        </div>
        {showFooter ? (
          <div
            className="flex min-w-0 flex-col gap-3 border-t border-border pt-3"
            data-provider-footer=""
          >
            {provider.kind === "serp" && canManageProviders ? (
              <ProviderDataSourceSlot
                onSelectOwn={() => setDrawerOpen(true)}
                projectId={projectId}
                provider={provider}
              />
            ) : null}
            <ProviderCardFeedback
              disconnectNotice={disconnectNotice}
              neverSynced={!hasConsumerRows && Boolean(provider.neverSynced)}
              syncResult={hasConsumerRows ? null : syncResult}
              testResult={testResult}
            />
            <ProviderCardActions
              actions={actions}
              canManageProviders={canManageProviders}
              onManage={() => setDrawerOpen(true)}
              onDisconnected={() => setDrawerOpen(false)}
              onNotice={setDisconnectNotice}
              onSecondaryAction={handleSecondaryAction}
              onSync={handleTrafficSync}
              projectId={projectId}
              provider={provider}
              readOnly={readOnly}
              showSync={canSync && canUpdateProject && !hasConsumerRows}
              syncPending={syncPending}
              testPending={testPending}
            />
          </div>
        ) : null}
      </Card>
      {canManageProviders ? (
        <ConnectDrawer
          actions={actions}
          deploymentMode={deploymentMode}
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          projectId={projectId}
          projectRef={projectRef}
          provider={provider}
          searchSyncPlan={searchSyncPlan}
        />
      ) : null}
    </>
  );
}
