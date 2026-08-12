"use client";

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
  analyticsOption?: ReactNode;
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
  analyticsOption,
  connections,
  dirtyProviders,
  onSelect,
  selectedProviderId,
  testResults,
}: Readonly<StepConnectProviderCardsProps>) {
  return (
    <div className="mt-[22px]">
      {analyticsNotice}
      <div className="grid items-stretch gap-3 sm:grid-cols-3">
        <div aria-label="SERP provider" className="contents" role="radiogroup">
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
        {analyticsOption}
      </div>
      {Object.keys(connections).length > 0 ? (
        <p className="m-0 mt-2 text-[11.5px] text-fg-muted">
          Connections are saved per provider - switching does not disconnect.
        </p>
      ) : null}
    </div>
  );
}
