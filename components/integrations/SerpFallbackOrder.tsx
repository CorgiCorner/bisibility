"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Card, MonoText, Switch } from "@/components/ui";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { compareProviderChainEntries } from "@/lib/rank-check/provider-chain-order";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  CheckCircleIcon as CheckCircle,
  MinusCircleIcon as MinusCircle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
        return { enabled: true, primary: activeIndex === 0, priority: activeIndex, provider };
      }
      const priority = pausedPriority;
      pausedPriority += 1;
      return { enabled: false, primary: false, priority, provider };
    });
}

function statusCopy(provider: IntegrationProviderData, activeIndex: number) {
  if (provider.status !== "connected") return "Not connected";
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setItems(orderedProviders(providers)), [providers]);

  const active = useMemo(
    () => items.filter((provider) => provider.status === "connected" && provider.enabled !== false),
    [items],
  );
  const paused = useMemo(
    () => items.filter((provider) => provider.status === "connected" && provider.enabled === false),
    [items],
  );
  const disconnected = useMemo(
    () => items.filter((provider) => provider.status !== "connected"),
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
        await actions.setPrimaryProvider({
          enabled: setting.enabled,
          primary: setting.primary,
          priority: setting.priority,
          projectId,
          providerId: setting.provider.id as Parameters<
            ProviderActionHandlers["setPrimaryProvider"]
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
        className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 sm:px-4"
        key={provider.id}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${
            isEnabled ? "bg-accent-soft text-accent" : "bg-bg-sunken text-fg-faint"
          }`}
        >
          {position ?? "-"}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-fg">{provider.name}</span>
            {isEnabled ? (
              <CheckCircle aria-label="Active" className="text-green" size={15} weight="fill" />
            ) : (
              <MinusCircle
                aria-label={isConnected ? "Paused" : "Not connected"}
                className="text-fg-faint"
                size={15}
              />
            )}
          </div>
          <p className="m-0 mt-0.5 text-[11.5px] leading-5 text-fg-faint">
            {statusCopy(provider, activeIndex)}
          </p>
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong text-fg-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={!canManage || activeIndex === 0}
                  onClick={() => move(provider.id, -1)}
                  type="button"
                >
                  <ArrowUp aria-hidden size={15} />
                </button>
                <button
                  aria-label={`Move ${provider.name} down`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong text-fg-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={!canManage || activeIndex === active.length - 1}
                  onClick={() => move(provider.id, 1)}
                  type="button"
                >
                  <ArrowDown aria-hidden size={15} />
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
          <span className="font-mono text-[10px] uppercase text-fg-faint">Connect below</span>
        ) : null}
      </li>
    );
  }

  return (
    <Card className="overflow-hidden p-0" size="md">
      <div className="border-border-soft border-b px-4 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <MonoText className="uppercase tracking-[0.5px]" size="sm">
            SERP fallback order
          </MonoText>
          <MonoText muted>{pending ? "Saving order…" : `${active.length} active`}</MonoText>
        </div>
        <p className="m-0 mt-1 text-[12.5px] leading-5 text-fg-muted">
          Rank checks try active providers from top to bottom. If one fails or is rate-limited,
          bisibility continues with the next active provider.
        </p>
      </div>
      <ol className="m-0 list-none divide-y divide-border-soft p-0">
        {active.map((provider, index) => providerRow(provider, index))}
        {paused.map((provider) => providerRow(provider, -1))}
        {disconnected.map((provider) => providerRow(provider, -1))}
      </ol>
      {error ? (
        <p
          className="m-0 border-border-soft border-t px-4 py-2.5 text-[12px] text-red"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </Card>
  );
}
