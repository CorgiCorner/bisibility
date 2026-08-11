"use client";

import { InfoTooltip, type StatusKind, StatusPill } from "@/components/ui";
import type { OnboardingSerpProviderId, providerOptions } from "./StepConnectProvider.fields";

export type ProviderCardState = "connected" | "failed" | "idle" | "tested";

type ProviderCardProps = {
  fallbackPrompt?: boolean;
  balance?: number;
  provider: (typeof providerOptions)[number];
  selected: boolean;
  state: ProviderCardState;
  primary?: boolean;
  onSelect: (providerId: OnboardingSerpProviderId) => void;
};

function stateClass(selected: boolean) {
  if (selected) return "border-accent bg-accent-soft ring-1 ring-inset ring-accent";
  return "border-border-strong bg-transparent";
}

function stateText(state: ProviderCardState, primary?: boolean) {
  if (state === "connected") return primary ? "Connected (primary)" : "Connected (fallback)";
  if (state === "tested") return "Verified";
  if (state === "failed") return "Test failed";
  return "Ready to connect";
}

function statusKind(state: ProviderCardState): StatusKind {
  if (state === "connected" || state === "tested") return "connected";
  if (state === "failed") return "needs_reauth";
  return "ready";
}

export function ProviderCard({
  fallbackPrompt = false,
  balance,
  provider,
  selected,
  state,
  primary = false,
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
      <span className="pointer-events-none relative z-[1] flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-fg">{provider.label}</span>
        <StatusPill label={stateText(state, primary)} size="sm" status={statusKind(state)} />
      </span>
      <span className="pointer-events-none relative z-[1] mt-1 flex items-start gap-1 text-[12.5px] leading-[1.4] text-fg-muted">
        <span>{provider.costCaption}</span>
        <span className="pointer-events-auto">
          <InfoTooltip text={provider.costDetail} />
        </span>
      </span>
      {state === "connected" && balance !== undefined ? (
        <span className="pointer-events-none relative z-[1] mt-3 block font-mono text-xs text-green-text">
          Balance: {balance}
        </span>
      ) : null}
      {fallbackPrompt ? (
        <p className="pointer-events-none relative z-[1] m-0 mt-3 rounded-[10px] border border-border bg-bg-elev p-3 text-[12.5px] leading-[1.45] text-fg-muted">
          <span className="font-semibold text-fg">Add as fallback (optional)</span> - automatic
          fallback on outages and rate limits, and full city-level targeting works best with both
          providers connected.
        </p>
      ) : null}
      <span className="pointer-events-none relative z-[1] mt-auto flex items-center justify-between gap-2 pt-3">
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
          <span className="shrink-0 whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.4px] text-fg-muted">
            Affiliate link
          </span>
        ) : null}
      </span>
    </section>
  );
}
