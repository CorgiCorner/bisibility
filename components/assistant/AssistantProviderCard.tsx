"use client";

import { KeySettings } from "@/components/assistant/KeySettings";
import { ConnectDrawer } from "@/components/integrations/ConnectDrawer";
import { ProviderCardHeader } from "@/components/integrations/ProviderCardHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { AssistantRequestError, assistantFetch } from "@/lib/assistant/client/api";
import { PROVIDER_LABELS } from "@/lib/assistant/client/provider-label";
import { resolveAssistantFunding } from "@/lib/assistant/funding-resolve";
import {
  ASSISTANT_API,
  type AssistantConfigView,
  type AssistantErrorCode,
  type AssistantProvider,
  type FundingMode,
  fundingPreferenceRequestSchema,
} from "@/lib/assistant/wire";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { appPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function AssistantProviderCard({
  config,
  projectRef,
  provider,
  modelProvider,
  actions,
  initialOpen = false,
  canManage = true,
}: Readonly<{
  config: AssistantConfigView;
  projectRef: string;
  provider: AssistantProvider;
  modelProvider?: IntegrationProviderData;
  actions?: ProviderActionHandlers;
  initialOpen?: boolean;
  canManage?: boolean;
}>) {
  const t = useTranslations("assistant");
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen && canManage);
  const [error, setError] = useState<AssistantErrorCode | "network" | null>(null);
  const byok = config.funding.find((item) => item.provider === provider && item.mode === "byok");
  const credits = config.funding.find(
    (item) => item.provider === provider && item.mode === "credits",
  );
  const stored = config.fundingPreference.find((item) => item.provider === provider)?.mode ?? null;
  const mode = resolveAssistantFunding({
    stored,
    provider,
    options: config.funding,
    creditsEnabled: config.creditsEnabled,
  }).mode;
  const [selected, setSelected] = useState<FundingMode>(config.creditsEnabled ? mode : "byok");
  const [saving, setSaving] = useState(false);
  const activeMode = config.creditsEnabled ? selected : "byok";
  const credential = byok?.credential ?? null;
  const creditsAvailable = Boolean(credits?.available);
  const ownConnected = modelProvider
    ? modelProvider.status === "connected" && modelProvider.enabled !== false
    : credential?.status === "active";
  const status = (activeMode === "credits" ? creditsAvailable : ownConnected)
    ? "connected"
    : activeMode === "byok" && credential
      ? "needs_reauth"
      : "ready";
  async function choose(next: string) {
    if (next !== "byok" && next !== "credits") return;
    const choice = next as FundingMode;
    if (choice === selected || !canManage || saving) return;
    setError(null);
    const body = fundingPreferenceRequestSchema.parse({
      project: projectRef,
      provider,
      mode: choice,
    });
    setSaving(true);
    try {
      await assistantFetch(ASSISTANT_API.funding, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSelected(choice);
      if (choice === "byok" && !credential) setOpen(true);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof AssistantRequestError ? (failure.detail?.code ?? "network") : "network",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4">
      <ProviderCardHeader
        canManageProviders={canManage}
        provider={{
          ...(modelProvider ?? {}),
          icon: modelProvider?.icon ?? "database",
          name: PROVIDER_LABELS[provider],
          status,
          tint: "var(--fg-muted)",
        }}
      />
      {config.creditsEnabled ? (
        <div className="flex min-w-0 flex-col gap-2">
          <SegmentedControl<FundingMode>
            ariaLabel={t("sourceTitle")}
            disabled={!canManage}
            fitContent
            loading={saving}
            onChange={(value) => void choose(value)}
            options={[
              { value: "credits", label: t("credits") },
              { value: "byok", label: t("sourceOwn") },
            ]}
            size="toolbar"
            value={activeMode}
          />
          {activeMode !== "credits" || creditsAvailable ? null : (
            <p className="m-0 text-[11.5px] leading-[1.5] text-fg-muted">
              {t("sourceCreditsUnavailable")}
            </p>
          )}
          {error ? (
            <p role="alert">{error === "network" ? t("networkError") : t(`errors.${error}`)}</p>
          ) : null}
        </div>
      ) : null}
      {canManage ? (
        <div className="mt-auto flex border-t border-border pt-3">
          {activeMode === "credits" ? (
            <Button href={appPath(projectRef, "usage")} size="sm" variant="secondary">
              {t("aiLimitLink")}
            </Button>
          ) : (
            <Button onClick={() => setOpen(true)} size="sm" type="button" variant="secondary">
              {(modelProvider ? modelProvider.hasStoredCredentials : credential)
                ? t("manageKey")
                : t("connect")}
            </Button>
          )}
        </div>
      ) : null}
      {open && modelProvider ? (
        <ConnectDrawer
          actions={actions}
          deploymentMode="cloud"
          onClose={() => setOpen(false)}
          open
          projectId={projectRef}
          projectRef={projectRef}
          provider={modelProvider}
        />
      ) : open ? (
        <Sheet
          onClose={() => setOpen(false)}
          open
          title={PROVIDER_LABELS[provider]}
          widthVariant="form"
        >
          <KeySettings
            options={config.funding}
            provider={provider}
            refresh={async () => {
              router.refresh();
            }}
          />
        </Sheet>
      ) : null}
    </Card>
  );
}
