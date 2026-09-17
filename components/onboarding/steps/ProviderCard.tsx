"use client";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { type StatusKind, StatusPill } from "@/components/ui/StatusPill";
import { useTranslations } from "next-intl";
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
  if (selected) return "border-accent bg-transparent";
  return "border-border bg-transparent";
}

function stateText(
  t: ReturnType<typeof useTranslations<"onboarding.provider.cards">>,
  state: ProviderCardState,
) {
  return t(`status.${state}`);
}

function statusKind(state: ProviderCardState): StatusKind {
  if (state === "connected" || state === "tested") return "connected";
  if (state === "failed") return "needs_reauth";
  if (state === "dirty") return "update";
  return "disabled";
}

function providerCopy(
  t: ReturnType<typeof useTranslations<"onboarding.provider.cards">>,
  providerId: OnboardingSerpProviderId,
) {
  if (providerId === "dataforseo") {
    return {
      capability: t("dataforseo.capability"),
      costCaption: t("dataforseo.costCaption"),
      costDetail: t("dataforseo.costDetail"),
      label: t("dataforseo.label"),
    };
  }
  return {
    capability: t("serpapi.capability"),
    costCaption: t("serpapi.costCaption"),
    costDetail: t("serpapi.costDetail"),
    label: t("serpapi.label"),
  };
}

export function ProviderCard({
  balance,
  provider,
  selected,
  state,
  onSelect,
}: Readonly<ProviderCardProps>) {
  const t = useTranslations("onboarding.provider.cards");
  const copy = providerCopy(t, provider.value);
  return (
    <section
      className={`relative flex h-full flex-col rounded-card border p-4 transition-colors ${stateClass(selected)}`}
    >
      <input
        aria-checked={selected}
        aria-label={copy.label}
        checked={selected}
        className="absolute inset-0 z-0 m-0 size-full cursor-pointer appearance-none rounded-card border-0 bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
        name="onboarding-serp-provider"
        onChange={() => onSelect(provider.value)}
        type="radio"
        value={provider.value}
      />
      <span className="pointer-events-none relative z-1 flex flex-col items-start gap-2">
        <span className="text-sm font-semibold text-fg">{copy.label}</span>
        <span className="text-xs leading-[1.4] text-fg-muted">{copy.capability}</span>
        <StatusPill label={stateText(t, state)} size="sm" status={statusKind(state)} />
      </span>
      <span className="pointer-events-none relative z-1 mt-2 flex items-start gap-1 text-[12.5px] leading-[1.4] text-fg-muted">
        <span>{copy.costCaption}</span>
        <span className="pointer-events-auto">
          <InfoTooltip text={copy.costDetail} />
        </span>
      </span>
      {state === "connected" && balance !== undefined ? (
        <span className="pointer-events-none relative z-1 mt-3 block text-xs text-green-text tabular-nums">
          {t("balance", { balance })}
        </span>
      ) : null}
      <span className="pointer-events-none relative z-1 mt-auto flex flex-wrap items-baseline gap-[5px] pt-3">
        <a
          className="pointer-events-auto inline-flex whitespace-nowrap text-[12.5px] font-semibold text-accent-text hover:underline"
          href={provider.docsHref}
          rel={provider.affiliate ? "sponsored noopener noreferrer" : "noreferrer"}
          target="_blank"
        >
          {t("getCredentials")}
        </a>
        {provider.affiliate ? (
          <span className="text-[11.5px] text-fg-muted">· {t("affiliate")}</span>
        ) : null}
      </span>
    </section>
  );
}
