"use client";

import { InfoTooltip, type StatusKind, StatusPill } from "@/components/ui";
import type { OnboardingSerpProviderId, providerOptions } from "./StepConnectProvider.fields";

export type ProviderCardState = "connected" | "dirty" | "failed" | "idle" | "tested";

type ProviderCardProps = {
  balance?: number;
  provider: (typeof providerOptions)[number];
  selected: boolean;
  state: ProviderCardState;
  onSelect: (providerId: OnboardingSerpProviderId) => void;
};

function stateClass(selected: boolean) {
  if (selected) return "border-accent bg-accent-soft ring-1 ring-inset ring-accent";
  return "border-border-strong bg-transparent";
}

function stateText(state: ProviderCardState) {
  if (state === "connected") return "Connected";
  if (state === "dirty") return "Unsaved changes";
  if (state === "tested") return "Verified";
  if (state === "failed") return "Test failed";
  return "Not connected";
}

function statusKind(state: ProviderCardState): StatusKind {
  if (state === "connected" || state === "tested") return "connected";
  if (state === "failed") return "needs_reauth";
  return "ready";
}

export function ProviderCard({
  balance,
  provider,
  selected,
  state,
  onSelect,
}: Readonly<ProviderCardProps>) {
  return (
    <section
      className={`relative flex h-full flex-col rounded-[14px] border p-4 transition-colors ${stateClass(selected)}`}
    >
      <input
        aria-checked={selected}
        aria-label={provider.label}
        checked={selected}
        className="absolute inset-0 z-0 m-0 size-full cursor-pointer appearance-none rounded-[14px] border-0 bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
        name="onboarding-serp-provider"
        onChange={() => onSelect(provider.value)}
        type="radio"
        value={provider.value}
      />
      <span className="pointer-events-none relative z-1 flex flex-col items-start gap-2">
        <span className="text-sm font-semibold text-fg">{provider.label}</span>
        <span className="text-xs leading-[1.4] text-fg-muted">{provider.capability}</span>
        <StatusPill label={stateText(state)} size="sm" status={statusKind(state)} />
      </span>
      <span className="pointer-events-none relative z-1 mt-2 flex items-start gap-1 text-[12.5px] leading-[1.4] text-fg-muted">
        <span>{provider.costCaption}</span>
        <span className="pointer-events-auto">
          <InfoTooltip text={provider.costDetail} />
        </span>
      </span>
      {state === "connected" && balance !== undefined ? (
        <span className="pointer-events-none relative z-1 mt-3 block font-mono text-xs text-green-text">
          Balance: {balance}
        </span>
      ) : null}
      <span className="pointer-events-none relative z-1 mt-auto flex flex-wrap items-baseline gap-[5px] pt-3">
        <a
          className="pointer-events-auto inline-flex whitespace-nowrap text-[12.5px] font-semibold text-accent-text hover:underline"
          href={provider.docsHref}
          rel={provider.affiliate ? "sponsored noopener noreferrer" : "noreferrer"}
          target="_blank"
          title={provider.affiliate ? "Affiliate link" : undefined}
        >
          Get API credentials ↗
        </a>
        {provider.affiliate ? (
          <>
            <span aria-hidden className="text-[11.5px] text-fg-muted">
              /
            </span>
            <span className="text-[11.5px] text-fg-muted">affiliate</span>
          </>
        ) : null}
      </span>
    </section>
  );
}
