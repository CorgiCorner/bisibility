"use client";
import { ProviderAccessEmptyState } from "@/components/ui/ProviderAccessEmptyState";
import {
  ProviderAccessScopeProvider,
  useProviderAccessScope,
} from "@/components/ui/ProviderAccessScopeProvider";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { modelProviderName } from "@/lib/model-playground/composer-state";
import { MODEL_PROVIDER_CATALOG } from "@/lib/providers/model/catalog-metadata";
import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";

export function ModelPlaygroundSetupState({
  projectId,
  canConnect,
}: Readonly<{
  projectId: string;
  canConnect: boolean;
}>) {
  const scope = useProviderAccessScope();
  const t = useTranslations("projectAiResearch.modelPlayground");
  return (
    <ProviderAccessScopeProvider
      scope={{
        projectRef: projectId,
        canManageProviders: canConnect && (scope?.canManageProviders ?? true),
        readOnly: scope?.readOnly ?? false,
      }}
    >
      <div data-model-playground-setup>
        <ProviderAccessEmptyState
          href={appPath(projectId, "providers")}
          providers={NATIVE_MODEL_PROVIDERS.map(modelProviderName)}
          surface="ai"
          title={t("connectTitle")}
          description={
            <div className="grid gap-4">
              <p className="m-0">
                {t(canConnect ? "connectDescription" : "memberConnectDescription")}
              </p>
              <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-4 p-0">
                {MODEL_PROVIDER_CATALOG.map((provider) => (
                  <li className="grid w-20 justify-items-center gap-1.5" key={provider.id}>
                    <ProviderLogo
                      appearance="bare"
                      theme="auto"
                      alt={provider.label}
                      domain={provider.logoDomain}
                      fallbackIcon="globe"
                      size="sm"
                      tint="var(--fg-muted)"
                    />
                    <span className="text-ui-caption">{provider.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          }
          actionLabel={t("connectAction")}
        />
      </div>
    </ProviderAccessScopeProvider>
  );
}
