"use client";

import { InfoTooltip } from "@/components/ui";
import {
  CheckCircleIcon as CheckCircle,
  CircleNotchIcon as CircleNotch,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { OnboardingSerpProviderId, providerOptions } from "./StepConnectProvider.fields";

export type ProviderCardState = "connected" | "failed" | "idle" | "selected" | "tested" | "testing";

type ProviderCardProps = {
  backupPrompt?: boolean;
  balance?: number;
  provider: (typeof providerOptions)[number];
  selected: boolean;
  state: ProviderCardState;
  primary?: boolean;
  onSelect: (providerId: OnboardingSerpProviderId) => void;
};

function stateClass(state: ProviderCardState, selected: boolean) {
  if (state === "connected") return "border-green bg-bg-elev";
  if (state === "tested") return "border-green bg-bg-elev";
  if (state === "failed") return "border-red bg-bg-elev";
  if (selected || state === "testing") return "border-accent bg-accent-soft";
  return "border-border-strong bg-bg-sunken";
}

function stateText(state: ProviderCardState, primary?: boolean) {
  if (state === "connected") return primary ? "Connected (primary)" : "Connected (backup)";
  if (state === "tested") return "Verified";
  if (state === "failed") return "Test failed";
  if (state === "testing") return "Testing...";
  if (state === "selected") return "Selected";
  return "Ready to connect";
}

function StateIcon({ state }: Readonly<{ state: ProviderCardState }>) {
  if (state === "connected" || state === "tested") {
    return <CheckCircle aria-hidden className="text-green" size={17} weight="fill" />;
  }
  if (state === "failed") {
    return <WarningCircle aria-hidden className="text-red" size={17} weight="fill" />;
  }
  if (state === "testing") {
    return <CircleNotch aria-hidden className="bv-spin text-accent" size={17} weight="bold" />;
  }
  return null;
}

export function ProviderCard({
  backupPrompt = false,
  balance,
  provider,
  selected,
  state,
  primary = false,
  onSelect,
}: Readonly<ProviderCardProps>) {
  return (
    <section
      className={`flex h-full flex-col rounded-[14px] border p-4 transition-colors ${stateClass(state, selected)}`}
    >
      <button
        aria-pressed={selected}
        className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
        onClick={() => onSelect(provider.value)}
        type="button"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-fg">{provider.label}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-bg-elev px-2 py-1 font-mono text-[10px] text-fg-muted">
            <StateIcon state={state} />
            {stateText(state, primary)}
          </span>
        </span>
      </button>
      <span className="mt-1 flex items-start gap-1 text-[12.5px] leading-[1.4] text-fg-muted">
        <span>{provider.costCaption}</span>
        <InfoTooltip text={provider.costDetail} />
      </span>
      {state === "connected" && balance !== undefined ? (
        <span className="mt-3 block font-mono text-xs text-green">Balance: {balance}</span>
      ) : null}
      {backupPrompt ? (
        <p className="m-0 mt-3 rounded-[10px] border border-border bg-bg-elev p-3 text-[12.5px] leading-[1.45] text-fg-muted">
          <span className="font-semibold text-fg">Add as backup (optional)</span> - automatic
          fallback on outages and rate limits, and full city-level targeting works best with both
          providers connected.
        </p>
      ) : null}
      <span className="mt-auto flex items-center justify-between gap-2 pt-3">
        <a
          className="inline-flex whitespace-nowrap text-[12.5px] font-semibold text-accent hover:underline"
          href={provider.docsHref}
          rel={provider.affiliate ? "sponsored noopener noreferrer" : "noreferrer"}
          target="_blank"
          title={provider.affiliate ? "Affiliate link" : undefined}
        >
          Get API credentials ↗
        </a>
        {provider.affiliate ? (
          <span className="shrink-0 whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.4px] text-fg-faint">
            Affiliate link
          </span>
        ) : null}
      </span>
    </section>
  );
}
