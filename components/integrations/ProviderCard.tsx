"use client";
import { ConnectDrawer } from "@/components/integrations/ConnectDrawer";
import { ProviderCredentialWarning } from "@/components/integrations/ProviderCredentialWarning";
import { ProviderSyncFailureAlert } from "@/components/integrations/ProviderSyncFailureAlert";
import { ProviderDataSourceSlot } from "@/components/settings/AccountDataSourceSlot";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusChip } from "@/components/ui/StatusChip";
import { StatusPill } from "@/components/ui/StatusPill";
import { testConnection as testConnectionAction } from "@/lib/actions/providers";
import type { ProviderActionHandlers, ProviderTestResult } from "@/lib/integrations/types";
import { VIEWER_READ_ONLY_LABEL } from "@/lib/ui/viewer-affordances";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Notice } from "./ConnectDrawerSchema";
import type { ProviderCardProps } from "./ProviderCard.types";
import { ProviderCardDescription } from "./ProviderCardDescription";
import { ProviderCardDisconnectMenu } from "./ProviderCardDisconnectMenu";
import { ProviderCardFeedback } from "./ProviderCardFeedback";
import { ProviderCardMeta } from "./ProviderCardMeta";
import { ProviderConsumerRows } from "./ProviderConsumerRows";

export type { ProviderCardProps } from "./ProviderCard.types";

import { outlineActionStyle, providerConsumerStatuses } from "./provider-card-config";
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
  const [drawerOpen, setDrawerOpen] = useState(initialOpen && canManageProviders);
  const [testPending, setTestPending] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [disconnectNotice, setDisconnectNotice] = useState<Notice | null>(null);
  const { readOnly } = useProjectWriteMode();
  const actionVariant = provider.status === "connected" ? "secondary" : "primary";
  const actionStyle = provider.status === "connected" ? outlineActionStyle : undefined;
  const managementActionLabel = t(
    provider.id === "gsc" && provider.status === "connected" ? "connectionSettings" : "manage",
  );
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
        className="flex min-w-0 flex-col p-4"
        size="md"
        style={{ opacity: provider.status === "planned" ? 0.92 : 1 }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ProviderLogo
            alt={t("logo", { provider: provider.name })}
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
              {canManageProviders ? null : (
                <StatusChip label={VIEWER_READ_ONLY_LABEL} size="sm" tone="neutral" />
              )}
              {provider.status === "connected" && provider.enabled === false ? (
                <StatusPill size="sm" status="disabled" />
              ) : null}
            </div>
          </div>
        </div>
        <ProviderCardDescription provider={provider} />

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
            {provider.id === "gsc"
              ? t("reauthGsc")
              : provider.id === "ga4"
                ? t("reauthGa4")
                : t("reauthGeneric")}
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
          {canManageProviders || (canSync && canUpdateProject && !hasConsumerRows) ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {provider.secondaryAction && canManageProviders && provider.status !== "connected" ? (
                <ProjectReadOnlyTooltip className="inline-flex">
                  <Button
                    disabled={readOnly || testPending}
                    onClick={() => void handleSecondaryAction()}
                    size="xs"
                    style={outlineActionStyle}
                    type="button"
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
              {canSync && canUpdateProject && !hasConsumerRows ? (
                <ProjectReadOnlyTooltip className="inline-flex">
                  <Button
                    disabled={readOnly || syncPending}
                    onClick={() => void handleTrafficSync()}
                    size="xs"
                    style={outlineActionStyle}
                    type="button"
                    variant="secondary"
                  >
                    {syncPending ? t("syncing") : t("syncNow")}
                  </Button>
                </ProjectReadOnlyTooltip>
              ) : null}
              {canManageProviders && readOnly && provider.status !== "connected" ? (
                <ProjectReadOnlyTooltip className="inline-flex">
                  <Button
                    disabled
                    size="xs"
                    style={actionStyle}
                    type="button"
                    variant={actionVariant}
                  >
                    {provider.status === "needs_reauth" ? t("reconnect") : t("connect")}
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
                    : provider.status === "needs_reauth"
                      ? t("reconnect")
                      : t("connect")}
                </Button>
              ) : null}
              {provider.status === "connected" && canManageProviders ? (
                <ProviderCardDisconnectMenu
                  disconnectProvider={actions?.disconnectProvider}
                  hasTest={Boolean(provider.secondaryAction)}
                  onDisconnected={() => setDrawerOpen(false)}
                  onNotice={setDisconnectNotice}
                  onTest={() => void handleSecondaryAction()}
                  projectId={projectId ?? "prj_storybook"}
                  providerId={provider.id as ProviderId}
                  providerName={provider.name}
                  readOnly={readOnly}
                  testPending={testPending}
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
