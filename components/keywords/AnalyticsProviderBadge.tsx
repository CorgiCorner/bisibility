"use client";

import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { providerIcon } from "@/lib/integrations/provider-icon";
import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";

const providers: Record<string, { name: string; domain: string }> = {
  gsc: { name: "Google Search Console", domain: "google.com" },
  ga4: { name: "Google Analytics 4", domain: "google.com" },
  plausible: { name: "Plausible", domain: "plausible.io" },
};

export function analyticsProviderName(provider: string) {
  return providers[provider]?.name ?? provider.replace(/[-_]/g, " ");
}

export function AnalyticsProviderBadge({
  provider,
  connected,
}: Readonly<{ provider: string; connected: boolean }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.traffic.sync");
  const name = analyticsProviderName(provider);
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-control border bg-bg-elev py-1 pl-1 pr-2.5 text-[12px] font-medium",
        connected ? "border-green/40 text-fg" : "border-border text-fg-muted opacity-50 grayscale",
      )}
      data-analytics-provider={provider}
      data-connected={connected}
      title={t(connected ? "sourceActive" : "sourceInactive")}
    >
      <span aria-hidden>
        <ProviderLogo
          alt={name}
          domain={providers[provider]?.domain}
          fallbackIcon={providerIcon(provider, "analytics")}
          size="xs"
          tint={connected ? "var(--fg)" : "var(--fg-muted)"}
        />
      </span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}
