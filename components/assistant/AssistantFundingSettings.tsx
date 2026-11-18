"use client";

import { AssistantProviderCard } from "@/components/assistant/AssistantProviderCard";
import { ProviderCard } from "@/components/integrations/ProviderCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ASSISTANT_PROVIDERS, type AssistantConfigView } from "@/lib/assistant/wire";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function AssistantFundingSettings({
  config,
  projectRef,
  providers,
  actions,
  canManage = true,
  initialConnectProviderId,
  timeZone = "UTC",
}: Readonly<{
  config: AssistantConfigView;
  projectRef: string;
  providers?: readonly IntegrationProviderData[];
  actions?: ProviderActionHandlers;
  canManage?: boolean;
  initialConnectProviderId?: string;
  timeZone?: string;
}>) {
  const t = useTranslations("assistant");
  return (
    <section className="space-y-3" id="assistant-funding">
      <div className="space-y-1">
        <SectionTitle component="h2" size="md">
          {t("providerSectionTitle")}
        </SectionTitle>
        <p className="m-0 max-w-3xl text-[12.5px] leading-5 text-fg-muted">
          {t("providerSectionDescription")}
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] items-stretch gap-3">
        {(providers ?? ASSISTANT_PROVIDERS.map((id) => ({ id }))).map((modelProvider) => {
          const provider = ASSISTANT_PROVIDERS.find((id) => id === modelProvider.id);
          const native =
            "kind" in modelProvider ? (modelProvider as IntegrationProviderData) : undefined;
          return provider ? (
            <AssistantProviderCard
              config={config}
              key={provider}
              projectRef={projectRef}
              provider={provider}
              modelProvider={native}
              actions={actions}
              canManage={canManage}
              initialOpen={initialConnectProviderId === provider}
            />
          ) : native ? (
            <ProviderCard
              key={native.id}
              layout="stack"
              provider={native}
              projectId={projectRef}
              projectRef={projectRef}
              canManageProviders={canManage}
              canUpdateProject={canManage}
              actions={actions}
              initialOpen={initialConnectProviderId === native.id}
              timeZone={timeZone}
            />
          ) : null;
        })}
      </div>
      {config.creditsEnabled ? (
        <Link
          className="font-semibold text-accent-text hover:underline"
          href={appPath(projectRef, "usage")}
        >
          {t("aiLimitLink")}
        </Link>
      ) : null}
    </section>
  );
}
