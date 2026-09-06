"use client";

import { Button } from "@/components/ui";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/markets";
import type { ReactNode } from "react";
import type { PreflightProvider } from "./preflight-presentation";

type ChoiceButtonProps = {
  active: boolean;
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  title?: string;
};

type PreflightOptionGroupsProps = {
  disabled: boolean;
  onDepthChange: (depth: SerpDepth) => void;
  onProviderChange: (providerId: string) => void;
  providerFallbackNote?: string;
  providers: readonly PreflightProvider[];
  selectedDepth: SerpDepth;
  selectedProvider?: string;
};

function ChoiceButton({ active, children, disabled, onClick, title }: Readonly<ChoiceButtonProps>) {
  return (
    <Button
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      role="radio"
      size="xs"
      sx={
        active
          ? {
              backgroundColor: "var(--accent-soft)",
              borderColor: "var(--accent)",
              color: "var(--accent-text)",
            }
          : {
              backgroundColor: "var(--bg-elev)",
              borderColor: "var(--border-control)",
              color: "var(--fg-muted)",
            }
      }
      title={title}
      type="button"
      variant="secondary"
    >
      {children}
    </Button>
  );
}

export function PreflightOptionGroups({
  disabled,
  onDepthChange,
  onProviderChange,
  providerFallbackNote,
  providers,
  selectedDepth,
  selectedProvider,
}: Readonly<PreflightOptionGroupsProps>) {
  return (
    <section className="grid gap-3" aria-label="Run options">
      <div>
        <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-muted">
          Depth <span className="font-normal normal-case tracking-normal">· price per target</span>
        </p>
        <div
          aria-label="Result depth"
          className="mt-[7px] flex flex-wrap gap-1.5"
          role="radiogroup"
        >
          {serpDepthValues.map((depth) => (
            <ChoiceButton
              active={selectedDepth === depth}
              disabled={disabled}
              key={depth}
              onClick={() => onDepthChange(depth)}
            >
              Top {depth}
            </ChoiceButton>
          ))}
        </div>
      </div>

      <div>
        <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-muted">
          Primary provider
        </p>
        {providers.length > 1 ? (
          <div
            aria-label="Primary provider"
            className="mt-[7px] flex flex-wrap gap-1.5"
            role="radiogroup"
          >
            {providers.map((provider) => (
              <ChoiceButton
                active={selectedProvider === provider.id}
                disabled={disabled}
                key={provider.id}
                onClick={() => onProviderChange(provider.id)}
                title={provider.tooltip}
              >
                {provider.label}
                {provider.note ? (
                  <span className="ml-1 text-[10px] font-normal opacity-75">{provider.note}</span>
                ) : null}
              </ChoiceButton>
            ))}
          </div>
        ) : providers[0] ? (
          <p className="m-0 mt-[7px] text-[12px] text-fg">
            {providers[0].label} is set as the primary provider.
          </p>
        ) : null}
        {providerFallbackNote ? (
          <p className="m-0 mt-2 text-[10.5px] leading-[1.6] text-fg-muted">
            {providerFallbackNote}
          </p>
        ) : null}
      </div>
    </section>
  );
}
