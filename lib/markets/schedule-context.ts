import "server-only";

import { providerLabel } from "@/lib/checks/attempts";
import {
  compareProviderChainEntries,
  type ProviderChainEntry,
} from "@/lib/rank-check/provider-chain-order";
import { resolveSerpDepth } from "@/lib/serp/constants";

type ScheduleContextSource = {
  checkSchedules: readonly { isDefault?: boolean; name: string }[];
  defaults: { serpDepth?: number | null; timezone?: string | null } | null;
  providerConnections: readonly ProviderChainEntry[];
};

export function marketScheduleContext(source: ScheduleContextSource) {
  const connectedProviders = source.providerConnections
    .filter((entry) => entry.kind === "serp" && entry.enabled && entry.status === "connected")
    .sort(compareProviderChainEntries)
    .map(({ provider }) => ({ label: providerLabel(provider), value: provider }));
  return {
    connectedProviders,
    defaultScheduleName: source.checkSchedules.find((schedule) => schedule.isDefault)?.name ?? null,
    projectDefaults: {
      provider: connectedProviders.at(0) ?? null,
      serpDepth: resolveSerpDepth(source.defaults?.serpDepth ?? undefined),
    },
    projectTimezone: source.defaults?.timezone ?? "UTC",
  };
}

export type MarketScheduleContext = ReturnType<typeof marketScheduleContext>;
