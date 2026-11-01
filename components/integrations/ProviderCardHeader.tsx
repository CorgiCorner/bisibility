"use client";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusChip } from "@/components/ui/StatusChip";
import { StatusPill } from "@/components/ui/StatusPill";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { VIEWER_READ_ONLY_LABEL } from "@/lib/ui/viewer-affordances";
import { useTranslations } from "next-intl";

export function ProviderCardHeader({
  provider,
  canManageProviders,
}: Readonly<{
  provider: IntegrationProviderData;
  canManageProviders: boolean;
}>) {
  const t = useTranslations("projectIntegrations.provider");
  return (
    <div className="flex min-w-0 items-start gap-3" data-provider-header="">
      <span className="grid h-6 w-6 shrink-0 place-items-center">
        <ProviderLogo
          alt={t("logo", { provider: provider.name })}
          domain={provider.logoDomain}
          fallbackIcon={provider.icon}
          size="sm"
          tint={provider.tint}
        />
      </span>
      <div className="min-w-0 flex-1">
        <SectionTitle component="h3" size="sm">
          {provider.name}
        </SectionTitle>
        <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1.5">
          {provider.recovery?.paused ? (
            <StatusChip label={t("connectionPaused")} size="sm" tone="attention" />
          ) : provider.status === "ready" || provider.status === "optional" ? (
            <StatusChip label={t("notConnected")} size="sm" tone="neutral" />
          ) : provider.status === "connected" && provider.enabled === false ? null : (
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
  );
}
