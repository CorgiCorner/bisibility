"use client";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusChip } from "@/components/ui/StatusChip";
import { StatusPill } from "@/components/ui/StatusPill";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { VIEWER_READ_ONLY_LABEL } from "@/lib/ui/viewer-affordances";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function ProviderCardHeader({
  provider,
  canManageProviders,
  children,
}: Readonly<{
  provider: IntegrationProviderData;
  canManageProviders: boolean;
  children: ReactNode;
}>) {
  const t = useTranslations("projectIntegrations.provider");
  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 ${provider.kind === "serp" ? "content-start flex-wrap" : ""}`}
    >
      <ProviderLogo
        alt={t("logo", { provider: provider.name })}
        domain={provider.logoDomain}
        fallbackIcon={provider.icon}
        size="sm"
        tint={provider.tint}
      />
      <div className={`min-w-0 flex-1 ${provider.kind === "serp" ? "basis-36" : ""}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <SectionTitle component="h3" size="sm">
            {provider.name}
          </SectionTitle>
          {provider.status === "optional" ||
          provider.status === "ready" ||
          (provider.status === "connected" && provider.enabled === false) ? null : (
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
      {children}
    </div>
  );
}
