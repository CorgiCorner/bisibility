"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { compareProviderChainEntries } from "@/lib/rank-check/provider-chain-order";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { MinusCircleIcon as MinusCircle } from "@phosphor-icons/react/dist/csr/MinusCircle";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type SerpFallbackOrderProps = {
  actions?: ProviderActionHandlers;
  canManageProviders: boolean;
  projectId?: string;
  providers: readonly IntegrationProviderData[];
};

function orderedProviders(providers: readonly IntegrationProviderData[]) {
  return [...providers].sort((a, b) => {
    const connectedDelta = Number(b.status === "connected") - Number(a.status === "connected");
    const enabledDelta = Number(b.enabled !== false) - Number(a.enabled !== false);
    return (
      connectedDelta ||
      enabledDelta ||
      compareProviderChainEntries(
        { priority: a.priority ?? 1000, provider: a.id },
        { priority: b.priority ?? 1000, provider: b.id },
      )
    );
  });
}

function normalizedSettings(providers: readonly IntegrationProviderData[]) {
  const active = providers.filter(
    (provider) => provider.status === "connected" && provider.enabled !== false,
  );
  let pausedPriority = 100;

  return providers
    .filter((provider) => provider.status === "connected")
    .map((provider) => {
      const activeIndex = active.findIndex((candidate) => candidate.id === provider.id);
      if (activeIndex >= 0) {
        return { enabled: true, priority: activeIndex, provider };
      }
      const priority = pausedPriority;
      pausedPriority += 1;
      return { enabled: false, priority, provider };
    });
}

function statusCopy(provider: IntegrationProviderData, activeIndex: number) {
  if (provider.status !== "connected") return null;
  if (provider.enabled === false) return "Paused · not used for rank checks";
  return activeIndex === 0 ? "First provider" : `Fallback #${activeIndex + 1}`;
}

export function SerpFallbackOrder({
  actions,
  canManageProviders,
  projectId,
  providers,
}: Readonly<SerpFallbackOrderProps>) {
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const [items, setItems] = useState(() => orderedProviders(providers));
  const [itemsProviders, setItemsProviders] = useState(providers);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (itemsProviders !== providers) {
    setItemsProviders(providers);
    setItems(orderedProviders(providers));
  }

  const active = useMemo(
    () => items.filter((provider) => provider.status === "connected" && provider.enabled !== false),
    [items],
  );
  const paused = useMemo(
    () => items.filter((provider) => provider.status === "connected" && provider.enabled === false),
    [items],
  );
  const canManage = canManageProviders && Boolean(actions && projectId) && !readOnly && !pending;

  async function persist(next: IntegrationProviderData[]) {
    if (!actions || !projectId) return;
    const previous = items;
    setItems(next);
    setPending(true);
    setError(null);
    try {
      for (const setting of normalizedSettings(next)) {
        await actions.updateProviderSettings({
          enabled: setting.enabled,
          priority: setting.priority,
          projectId,
          providerId: setting.provider.id as Parameters<
            ProviderActionHandlers["updateProviderSettings"]
          >[0]["providerId"],
        });
      }
      router.refresh();
    } catch (cause) {
      setItems(previous);
      setError(cause instanceof Error ? cause.message : "Could not update the fallback order.");
    } finally {
      setPending(false);
    }
  }

  function move(providerId: string, delta: -1 | 1) {
    const currentIndex = items.findIndex((provider) => provider.id === providerId);
    const activeIndex = active.findIndex((provider) => provider.id === providerId);
    const target = active[activeIndex + delta];
    if (currentIndex < 0 || !target) return;
    const targetIndex = items.findIndex((provider) => provider.id === target.id);
    const next = [...items];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    void persist(next);
  }

  function toggle(providerId: string) {
    const next = items.map((provider) =>
      provider.id === providerId ? { ...provider, enabled: provider.enabled === false } : provider,
    );
    void persist(orderedProviders(next));
  }

  function providerRow(provider: IntegrationProviderData, activeIndex: number) {
    const isConnected = provider.status === "connected";
    const isEnabled = isConnected && provider.enabled !== false;
    const position = isEnabled ? activeIndex + 1 : null;

    return (
      <li
        className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2"
        key={provider.id}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
            isEnabled ? "bg-accent-soft text-accent-text" : "bg-bg-sunken text-fg-muted"
          }`}
        >
          {position ?? "-"}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-fg">{provider.name}</span>
            {isEnabled ? (
              <CheckCircle
                aria-label="Active"
                className="text-green-text"
                size={15}
                weight="regular"
              />
            ) : (
              <MinusCircle
                aria-label={isConnected ? "Paused" : "Not connected"}
                className="text-fg-muted"
                size={15}
                weight="regular"
              />
            )}
          </div>
          {statusCopy(provider, activeIndex) ? (
            <p className="m-0 mt-0.5 text-[11.5px] leading-5 text-fg-muted">
              {statusCopy(provider, activeIndex)}
            </p>
          ) : null}
        </div>
        {isConnected && canManageProviders ? (
          <div className="flex items-center gap-1.5">
            {isEnabled ? (
              <div
                className="flex items-center gap-1"
                aria-label={`${provider.name} order controls`}
              >
                <button
                  aria-label={`Move ${provider.name} up`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border-control text-fg-muted transition-colors hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={!canManage || activeIndex === 0}
                  onClick={() => move(provider.id, -1)}
                  type="button"
                >
                  <ArrowUp aria-hidden size={15} weight="regular" />
                </button>
                <button
                  aria-label={`Move ${provider.name} down`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border-control text-fg-muted transition-colors hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={!canManage || activeIndex === active.length - 1}
                  onClick={() => move(provider.id, 1)}
                  type="button"
                >
                  <ArrowDown aria-hidden size={15} weight="regular" />
                </button>
              </div>
            ) : null}
            <ProjectReadOnlyTooltip>
              <Switch
                aria-label={`${isEnabled ? "Pause" : "Activate"} ${provider.name}`}
                checked={isEnabled}
                className="border-0 bg-transparent p-1.5"
                disabled={!canManage}
                onChange={() => toggle(provider.id)}
              />
            </ProjectReadOnlyTooltip>
          </div>
        ) : canManageProviders ? (
          <span className="text-[10px] uppercase text-fg-muted">Not connected</span>
        ) : null}
      </li>
    );
  }

  return (
    <Card className="overflow-hidden p-0" size="md">
      <div className="px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[12px] font-semibold text-fg">SERP fallback order</span>
          <span className="text-[11px] text-fg-muted">
            {pending ? "Saving order…" : `${active.length} active`}
          </span>
        </div>
        <p className="m-0 mt-1 text-[12px] leading-5 text-fg-muted">
          {active.length + paused.length === 0
            ? "Connect a SERP provider above to configure fallback order."
            : "If a provider fails or is rate-limited, the next active provider is used."}
        </p>
      </div>
      {active.length + paused.length > 0 ? (
        <ol className="m-0 list-none divide-y divide-border border-border border-t p-0">
          {active.map((provider, index) => providerRow(provider, index))}
          {paused.map((provider) => providerRow(provider, -1))}
        </ol>
      ) : null}
      {error ? (
        <p
          className="m-0 border-border border-t px-4 py-2.5 text-[12px] text-red-text"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </Card>
  );
}
