"use client";

import { ConnectDrawer } from "@/components/integrations/ConnectDrawer";
import { ProviderCredentialWarning } from "@/components/integrations/ProviderCredentialWarning";
import { ProviderDisconnectAction } from "@/components/integrations/ProviderDisconnectAction";
import { ProviderSyncFailureAlert } from "@/components/integrations/ProviderSyncFailureAlert";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusPill } from "@/components/ui/StatusPill";
import { testConnection as testConnectionAction } from "@/lib/actions/providers";
import type { ProviderActionHandlers, ProviderTestResult } from "@/lib/integrations/types";
import { useState } from "react";
import type { Notice } from "./ConnectDrawerSchema";
import type { ProviderCardProps } from "./ProviderCard.types";
import { ProviderCardFeedback } from "./ProviderCardFeedback";
import { ProviderCardMeta } from "./ProviderCardMeta";
import { ProviderConsumerRows } from "./ProviderConsumerRows";

export type { ProviderCardProps } from "./ProviderCard.types";

import { DeveloperActionsMenu } from "@/components/settings/developers/DeveloperActionsMenu";
import {
  actionLabels,
  outlineActionStyle,
  providerConsumerStatuses,
  reauthCopy,
} from "./provider-card-config";
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
  const [drawerOpen, setDrawerOpen] = useState(initialOpen && canManageProviders);
  const [testPending, setTestPending] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [disconnectNotice, setDisconnectNotice] = useState<Notice | null>(null);
  const { readOnly } = useProjectWriteMode();
  const primaryAction = provider.status !== "connected";
  const actionVariant = primaryAction ? "primary" : "secondary";
  const actionStyle = primaryAction ? undefined : outlineActionStyle;
  const actionDisabled = readOnly && primaryAction;
  const managementActionLabel =
    provider.id === "gsc" && provider.status === "connected" ? "Connection settings" : "Manage";
  const canSync =
    provider.kind === "analytics" && provider.status === "connected" && provider.enabled !== false;
  const consumerStatuses = providerConsumerStatuses(provider);
  const hasConsumerRows = Boolean(consumerStatuses);
  const testProviderConnection =
    actions?.testProviderConnection ?? (projectId ? testConnectionAction : demoTestConnection);
  const { handleTrafficSync, syncPending, syncResult } = useProviderTrafficSync({
    projectId,
    readOnly,
    syncProjectTraffic: actions?.syncProjectTraffic,
  });
  async function handleSecondaryAction() {
    if (readOnly) {
      return;
    }
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
        message: error instanceof Error ? error.message : "Provider connection test failed.",
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
        className="flex min-w-0 flex-col p-4"
        size="md"
        style={{ opacity: provider.status === "planned" ? 0.92 : 1 }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ProviderLogo
            alt={`${provider.name} logo`}
            domain={provider.logoDomain}
            fallbackIcon={provider.icon}
            size="sm"
            tint={provider.tint}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <SectionTitle component="h3" size="sm">
                {provider.name}
              </SectionTitle>
              {provider.status === "optional" || provider.status === "ready" ? null : (
                <StatusPill size="sm" status={provider.status} />
              )}
              {provider.primary ? <StatusPill size="sm" status="primary" /> : null}
              {provider.status === "connected" && provider.enabled === false ? (
                <StatusPill size="sm" status="disabled" />
              ) : null}
            </div>
          </div>
        </div>
        <p className="m-0 mt-2 text-[12px] leading-5 text-fg-muted">{provider.description}</p>

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
        ) : (
          <ProviderCardMeta
            provider={
              consumerStatuses
                ? {
                    ...provider,
                    meta: consumerStatuses.searchModule.detail
                      ? [{ label: "Property", value: consumerStatuses.searchModule.detail }]
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
            {reauthCopy[provider.id as string] ??
              "Authorization is no longer valid. Reconnect to resume traffic syncs."}
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
        <div className="mt-auto">
          <ProviderCardFeedback
            disconnectNotice={disconnectNotice}
            neverSynced={!hasConsumerRows && Boolean(provider.neverSynced)}
            syncResult={hasConsumerRows ? null : syncResult}
            testResult={testResult}
          />
          {canManageProviders || (canSync && canUpdateProject && !hasConsumerRows) ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {provider.secondaryAction && canManageProviders && provider.status !== "connected" ? (
                <ProjectReadOnlyTooltip className="inline-flex">
                  <Button
                    disabled={readOnly || testPending}
                    onClick={() => {
                      void handleSecondaryAction();
                    }}
                    size="xs"
                    style={outlineActionStyle}
                    type="button"
                    variant="secondary"
                  >
                    {testPending ? "Testing..." : provider.secondaryAction}
                  </Button>
                </ProjectReadOnlyTooltip>
              ) : null}
              {canSync && canUpdateProject && !hasConsumerRows ? (
                <ProjectReadOnlyTooltip className="inline-flex">
                  <Button
                    disabled={readOnly || syncPending}
                    onClick={() => {
                      void handleTrafficSync();
                    }}
                    size="xs"
                    style={outlineActionStyle}
                    type="button"
                    variant="secondary"
                  >
                    {syncPending ? "Syncing..." : "Sync now"}
                  </Button>
                </ProjectReadOnlyTooltip>
              ) : null}
              {canManageProviders && actionDisabled ? (
                <ProjectReadOnlyTooltip className="inline-flex">
                  <Button
                    disabled
                    size="xs"
                    style={actionStyle}
                    type="button"
                    variant={actionVariant}
                  >
                    {provider.status === "connected"
                      ? managementActionLabel
                      : actionLabels[provider.status]}
                  </Button>
                </ProjectReadOnlyTooltip>
              ) : canManageProviders ? (
                <Button
                  onClick={() => setDrawerOpen(true)}
                  size="xs"
                  style={actionStyle}
                  type="button"
                  variant={actionVariant}
                >
                  {provider.status === "connected"
                    ? managementActionLabel
                    : actionLabels[provider.status]}
                </Button>
              ) : null}
              {provider.status === "connected" && canManageProviders ? (
                <ProviderDisconnectAction
                  disconnectProvider={actions?.disconnectProvider}
                  projectId={projectId ?? "prj_storybook"}
                  providerId={provider.id as ProviderId}
                  onDisconnected={() => setDrawerOpen(false)}
                  onNotice={setDisconnectNotice}
                  renderTrigger={({ disabled, onOpen }) => (
                    <DeveloperActionsMenu
                      ariaLabel={`Actions for ${provider.name}`}
                      items={[
                        ...(provider.secondaryAction
                          ? [
                              {
                                label: testPending ? "Testing..." : provider.secondaryAction,
                                disabled: readOnly || testPending,
                                onSelect: () => void handleSecondaryAction(),
                              },
                            ]
                          : []),
                        { label: "Disconnect", danger: true, disabled, onSelect: onOpen },
                      ]}
                    />
                  )}
                />
              ) : null}
            </div>
          ) : null}
        </div>
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
