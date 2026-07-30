"use client";

import { ProviderCard, type ProviderCardState } from "./ProviderCard";
import {
  type ConnectedProviderMap,
  type OnboardingSerpProviderId,
  type ProviderTestResult,
  providerOptions,
} from "./StepConnectProvider.fields";

type StepConnectProviderCardsProps = {
  connections: ConnectedProviderMap;
  onSelect: (providerId: OnboardingSerpProviderId) => void;
  primaryProviderId?: OnboardingSerpProviderId;
  selectedProviderId: OnboardingSerpProviderId;
  testingProviderId: OnboardingSerpProviderId | null;
  testResults: Partial<Record<OnboardingSerpProviderId, ProviderTestResult | null>>;
};

function providerState({
  connections,
  providerId,
  selectedProviderId,
  testingProviderId,
  testResults,
}: {
  connections: ConnectedProviderMap;
  providerId: OnboardingSerpProviderId;
  selectedProviderId: OnboardingSerpProviderId;
  testingProviderId: OnboardingSerpProviderId | null;
  testResults: Partial<Record<OnboardingSerpProviderId, ProviderTestResult | null>>;
}): ProviderCardState {
  if (testingProviderId === providerId) return "testing";
  if (connections[providerId]) return "connected";
  if (testResults[providerId]?.ok) return "tested";
  if (testResults[providerId] && !testResults[providerId]?.ok) return "failed";
  return selectedProviderId === providerId ? "selected" : "idle";
}

export function StepConnectProviderCards({
  connections,
  onSelect,
  primaryProviderId,
  selectedProviderId,
  testingProviderId,
  testResults,
}: Readonly<StepConnectProviderCardsProps>) {
  return (
    <div className="mt-[22px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {providerOptions.map((provider) => (
          <ProviderCard
            backupPrompt={
              Boolean(primaryProviderId) &&
              primaryProviderId !== provider.value &&
              !connections[provider.value]
            }
            balance={connections[provider.value]?.balance}
            key={provider.value}
            onSelect={onSelect}
            primary={connections[provider.value]?.primary}
            provider={provider}
            selected={selectedProviderId === provider.value}
            state={providerState({
              connections,
              providerId: provider.value,
              selectedProviderId,
              testingProviderId,
              testResults,
            })}
          />
        ))}
      </div>
      {Object.keys(connections).length > 0 ? (
        <p className="m-0 mt-2 text-[11.5px] text-fg-faint">
          Connections are saved per provider - switching does not disconnect.
        </p>
      ) : null}
    </div>
  );
}
