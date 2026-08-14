"use client";

import { InfoTooltip } from "@/components/ui";
import type { ReactNode } from "react";
import { ProviderCard, type ProviderCardState } from "./ProviderCard";
import {
  type ConnectedProviderMap,
  type OnboardingSerpProviderId,
  type ProviderTestResult,
  providerOptions,
} from "./StepConnectProvider.fields";

type StepConnectProviderCardsProps = {
  analyticsNotice?: ReactNode;
  connections: ConnectedProviderMap;
  dirtyProviders: Partial<Record<OnboardingSerpProviderId, boolean>>;
  onSelect: (providerId: OnboardingSerpProviderId) => void;
  selectedProviderId: OnboardingSerpProviderId;
  testResults: Partial<Record<OnboardingSerpProviderId, ProviderTestResult | null>>;
};

function providerState({
  connections,
  dirty,
  providerId,
  testResults,
}: {
  connections: ConnectedProviderMap;
  dirty: boolean;
  providerId: OnboardingSerpProviderId;
  testResults: Partial<Record<OnboardingSerpProviderId, ProviderTestResult | null>>;
}): ProviderCardState {
  if (connections[providerId] && !dirty) return "connected";
  if (testResults[providerId]?.ok) return "tested";
  if (testResults[providerId] && !testResults[providerId]?.ok) return "failed";
  if (dirty) return "dirty";
  return "idle";
}

export function StepConnectProviderCards({
  analyticsNotice,
  connections,
  dirtyProviders,
  onSelect,
  selectedProviderId,
  testResults,
}: Readonly<StepConnectProviderCardsProps>) {
  return (
    <div className="mt-[22px]">
      {analyticsNotice}
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
        Rank data / powers rank checks
        <InfoTooltip text="Google has no official rankings API, so checks run through a SERP provider. Bisibility uses your own provider account and you pay the provider directly, per check. You can skip this and connect later in Integrations - keywords can be added now, but checks stay paused until a provider is connected." />
      </div>
      <div
        aria-label="SERP provider"
        className="mt-2 grid items-stretch gap-3 sm:grid-cols-2"
        role="radiogroup"
      >
        {providerOptions.map((provider) => (
          <ProviderCard
            balance={connections[provider.value]?.balance}
            key={provider.value}
            onSelect={onSelect}
            provider={provider}
            selected={selectedProviderId === provider.value}
            state={providerState({
              connections,
              dirty: Boolean(dirtyProviders[provider.value]),
              providerId: provider.value,
              testResults,
            })}
          />
        ))}
      </div>
      <p className="m-0 mt-2 text-[11.5px] text-fg-muted">
        Connections are saved per provider - switching does not disconnect.
      </p>
    </div>
  );
}
