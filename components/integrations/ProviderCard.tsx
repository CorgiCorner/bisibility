"use client";

import { ConnectDrawer } from "@/components/integrations/ConnectDrawer";
import { ProviderCredentialWarning } from "@/components/integrations/ProviderCredentialWarning";
import { ProviderLogo } from "@/components/integrations/ProviderLogo";
import { ProviderStatusBadge } from "@/components/integrations/ProviderStatusBadge";
import { ProviderSyncFailureAlert } from "@/components/integrations/ProviderSyncFailureAlert";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Card, SectionTitle } from "@/components/ui";
import { testConnection as testConnectionAction } from "@/lib/actions/providers";
import type {
  IntegrationProviderData,
  ProviderActionHandlers,
  ProviderTestResult,
  ProviderTrafficSyncResult,
} from "@/lib/integrations/types";
import type { ProjectRef } from "@/lib/routing/app-path";
import { useState } from "react";

export type ProviderCardProps = {
  actions?: ProviderActionHandlers;
  canManageProviders: boolean;
  canUpdateProject: boolean;
  initialOpen?: boolean;
  noProvidersYet?: boolean;
  projectId?: string;
  projectRef?: ProjectRef;
  provider: IntegrationProviderData;
};

const actionLabels = {
  connected: "Manage",
  needs_reauth: "Reconnect",
  optional: "Connect",
  planned: "Connect",
  ready: "Connect",
} as const;

const outlineButtonClass =
  "w-full rounded-lg border border-border-strong bg-bg-elev px-3 py-[7px] text-[12.5px] font-semibold text-fg-muted outline-none transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const primaryButtonClass =
  "w-full rounded-lg bg-accent px-3.5 py-[7px] text-[12.5px] font-semibold text-white outline-none transition-colors hover:bg-accent-hover focus-visible:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const actionWrapperClass = "flex flex-1 sm:inline-flex sm:flex-initial";
type ProviderId = Parameters<ProviderActionHandlers["testProviderConnection"]>[0]["providerId"];

const demoTestConnection = async (): Promise<ProviderTestResult> => ({
  balance: 41_200,
  message: "Connection OK",
  ok: true,
});

const demoTrafficSync = async (): Promise<ProviderTrafficSyncResult> => ({
  connections: 1,
  keywordSnapshots: 12,
  pageSnapshots: 4,
  runs: [{ status: "succeeded_with_data" }],
});

export function ProviderCard({
  actions,
  canManageProviders,
  canUpdateProject,
  initialOpen = false,
  noProvidersYet = false,
  projectId,
  projectRef,
  provider,
}: Readonly<ProviderCardProps>) {
  const [drawerOpen, setDrawerOpen] = useState(initialOpen && canManageProviders);
  const [testPending, setTestPending] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [syncPending, setSyncPending] = useState(false);
  const [syncResult, setSyncResult] = useState<ProviderTestResult | null>(null);
  const { readOnly } = useProjectWriteMode();
  const primaryAction = provider.status !== "connected";
  const actionClassName = primaryAction ? primaryButtonClass : outlineButtonClass;
  const actionDisabled = readOnly && primaryAction;
  const canSync =
    provider.kind === "analytics" && provider.status === "connected" && provider.enabled !== false;

  const testProviderConnection =
    actions?.testProviderConnection ?? (projectId ? testConnectionAction : demoTestConnection);
  const syncProjectTraffic = actions?.syncProjectTraffic ?? demoTrafficSync;

  async function handleTrafficSync() {
    if (readOnly) {
      return;
    }

    setSyncPending(true);
    setSyncResult(null);
    try {
      const result = await syncProjectTraffic({ projectId: projectId ?? "prj_storybook" });
      const failures = result.runs.filter((run) => run.status === "failed").length;
      setSyncResult({
        message:
          failures > 0 && result.connections === 0
            ? "No analytics source completed. Check the provider credentials and worker logs."
            : `${result.keywordSnapshots} keyword and ${result.pageSnapshots} page snapshots updated.`,
        ok: failures === 0 || result.connections > 0,
      });
    } catch (error) {
      setSyncResult({
        message: error instanceof Error ? error.message : "Traffic sync failed.",
        ok: false,
      });
    } finally {
      setSyncPending(false);
    }
  }

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
        className="grid grid-cols-1 px-5 py-[18px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3.5"
        size="md"
        sx={{ opacity: provider.status === "planned" ? 0.92 : 1 }}
      >
        <div className="flex min-w-0 items-start gap-3.5 sm:col-start-1 sm:row-start-1">
          <ProviderLogo
            alt={`${provider.name} logo`}
            domain={provider.logoDomain}
            fallbackIcon={provider.icon}
            tint={provider.tint}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-[7px]">
              <SectionTitle className="text-[14.5px]" component="h3" size="md">
                {provider.name}
              </SectionTitle>
              <ProviderStatusBadge status={provider.status} />
              {provider.primary ? (
                <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-accent">
                  Primary
                </span>
              ) : null}
              {provider.status === "connected" && provider.enabled === false ? (
                <span className="inline-flex items-center rounded-full bg-bg-sunken px-2 py-0.5 font-mono text-[10px] font-semibold text-fg-faint">
                  Disabled
                </span>
              ) : null}
            </div>
            <p className="m-0 mt-[5px] text-[12.5px] leading-[1.5] text-fg-muted">
              {provider.description}
            </p>
          </div>
        </div>

        <dl className="m-0 mt-3.5 flex flex-wrap gap-x-9 gap-y-3 border-border-soft border-t pt-3.5 sm:col-span-2 sm:row-start-2">
          {provider.meta.map((row) => (
            <div key={row.label}>
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.5px] text-fg-faint">
                {row.label}
              </dt>
              <dd className="m-0 mt-[3px] font-mono text-[12.5px] text-fg-muted">{row.value}</dd>
            </div>
          ))}
        </dl>
        {provider.status === "needs_reauth" ? (
          <p
            className="m-0 mt-3 rounded-lg border border-red bg-red/5 px-3 py-2 text-[12.5px] leading-[1.45] text-red sm:col-span-2"
            role="alert"
          >
            Google authorization is no longer valid. Reconnect to resume traffic
            {provider.id === "gsc" ? " and index-status" : ""} syncs.
          </p>
        ) : null}
        <ProviderCredentialWarning credentialIssue={provider.credentialIssue} />
        {provider.syncFailure ? <ProviderSyncFailureAlert failure={provider.syncFailure} /> : null}
        <div className="mt-3.5 flex shrink-0 items-center gap-[7px] border-border-soft border-t pt-3.5 sm:col-start-2 sm:row-start-1 sm:mt-0 sm:flex-wrap sm:justify-end sm:border-t-0 sm:pt-0">
          {provider.secondaryAction && canManageProviders ? (
            <ProjectReadOnlyTooltip className={actionWrapperClass}>
              <button
                className={outlineButtonClass}
                disabled={readOnly || testPending}
                onClick={() => {
                  void handleSecondaryAction();
                }}
                type="button"
              >
                {testPending ? "Testing..." : provider.secondaryAction}
              </button>
            </ProjectReadOnlyTooltip>
          ) : null}
          {canSync && canUpdateProject ? (
            <ProjectReadOnlyTooltip className={actionWrapperClass}>
              <button
                className={outlineButtonClass}
                disabled={readOnly || syncPending}
                onClick={() => {
                  void handleTrafficSync();
                }}
                type="button"
              >
                {syncPending ? "Syncing..." : "Sync now"}
              </button>
            </ProjectReadOnlyTooltip>
          ) : null}
          {canManageProviders && actionDisabled ? (
            <ProjectReadOnlyTooltip className={actionWrapperClass}>
              <button className={actionClassName} disabled type="button">
                {actionLabels[provider.status]}
              </button>
            </ProjectReadOnlyTooltip>
          ) : canManageProviders ? (
            <button
              className={`${actionClassName} flex-1 sm:flex-initial`}
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              {actionLabels[provider.status]}
            </button>
          ) : null}
        </div>
        {testResult ? (
          <p
            className={`m-0 mt-3 text-[12.5px] leading-[1.45] sm:col-span-2 ${
              testResult.ok ? "text-green" : "text-red"
            }`}
            role={testResult.ok ? "status" : "alert"}
          >
            <strong className="font-semibold">
              {testResult.ok ? "Connection verified." : "Connection failed."}
            </strong>{" "}
            {testResult.message}
          </p>
        ) : null}
        {provider.neverSynced ? (
          <p className="m-0 mt-3 text-[12.5px] leading-[1.45] text-fg-muted sm:col-span-2">
            <strong className="font-semibold text-fg">Never synced.</strong> Traffic data appears
            after the first sync. Use Sync now to load it immediately.
          </p>
        ) : null}
        {syncResult ? (
          <p
            className={`m-0 mt-3 text-[12.5px] leading-[1.45] sm:col-span-2 ${
              syncResult.ok ? "text-green" : "text-red"
            }`}
            role={syncResult.ok ? "status" : "alert"}
          >
            <strong className="font-semibold">
              {syncResult.ok ? "Traffic sync finished." : "Traffic sync failed."}
            </strong>{" "}
            {syncResult.message}
          </p>
        ) : null}
      </Card>

      {canManageProviders ? (
        <ConnectDrawer
          actions={actions}
          defaultPrimary={noProvidersYet}
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          projectId={projectId}
          projectRef={projectRef}
          provider={provider}
        />
      ) : null}
    </>
  );
}
