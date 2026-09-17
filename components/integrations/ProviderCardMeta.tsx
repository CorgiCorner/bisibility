"use client";

import { useProviderMetaCopy } from "@/components/integrations/provider-meta-copy";
import { IdChip } from "@/components/ui/IdChip";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";

export function ProviderCardMeta({ provider }: Readonly<{ provider: IntegrationProviderData }>) {
  const copy = useProviderMetaCopy();
  const t = useTranslations("projectIntegrations.oauth");
  const meta =
    provider.status === "connected" || provider.status === "needs_reauth"
      ? provider.meta.filter((row) => row.labelKey !== "state")
      : [];
  if (meta.length === 0) return null;
  return (
    <dl className="m-0 mt-3 flex flex-wrap gap-x-4 gap-y-2">
      {meta.map((row) => {
        const value = copy.value(row);
        return (
          <div className="min-w-0" key={row.labelKey}>
            <dt className="text-[10px] text-fg-muted">{copy.label(row)}</dt>
            <dd className="m-0 mt-0.5 break-words text-[12px] text-fg">
              {provider.id === "ga4" && row.labelKey === "property" && /^\d+$/.test(value) ? (
                <IdChip
                  className="border-0 bg-transparent px-0"
                  copyLabel={t("copyPropertyId")}
                  size="xs"
                  value={value}
                />
              ) : (
                value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
