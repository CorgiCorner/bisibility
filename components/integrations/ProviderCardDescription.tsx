"use client";

import type { IntegrationProviderData } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";

export function ProviderCardDescription({
  provider,
}: Readonly<{ provider: IntegrationProviderData }>) {
  const t = useTranslations("projectIntegrations.provider");
  const description =
    provider.id === "gsc"
      ? t("gscDescription")
      : provider.id === "local-sequence"
        ? t("localDescription")
        : provider.kind === "serp"
          ? t("serpDescription", { provider: provider.name })
          : t("analyticsDescription", { provider: provider.name });

  return <p className="m-0 mt-2 text-[12px] leading-5 text-fg-muted">{description}</p>;
}
