import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import type { ProviderBinding, ProviderConnection } from "@usagekit/views";
import { createElement } from "react";
import { vi } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { ProjectSerpChain as Editor } from "./ProjectSerpChain";

export const providers = integrationCategories[0].providers.map((provider, priority) => ({
  ...provider,
  status: "connected" as const,
  enabled: true,
  priority,
}));
export const connection = (index: number): ProviderConnection => ({
  id: `conn_${index === 0 ? "first" : "second"}abcdefghijklmnopqr`,
  provider: providers[index].id,
  label: providers[index].name,
  revision: `${index + 1}`.repeat(64),
  enabled: true,
  priority: index,
  fundingSource: "byok",
  fallbackChain: [],
  plan: null,
  status: { state: "connected" },
  availability: { state: "unknown" },
  freshness: { observedAt: null, stale: true, source: "host" },
  capabilities: [],
  rates: [],
  hasStoredCredentials: true,
});
export const binding = (scope: string): ProviderBinding => ({
  scopeKey: scope,
  principalKey: "chain-user",
  authRevision: "admin:active",
  canManage: true,
});
export const reply = (connections = [connection(0), connection(1)], revision = "a".repeat(64)) => ({
  outcome: "ok",
  value: {
    kind: "connections",
    state: connections.length ? "ok" : "empty",
    connections,
    providers: [],
    revision,
    asOf: null,
    problem: null,
  },
});
export const legacy = {
  connectProvider: vi.fn(async () => undefined),
  disconnectProvider: vi.fn(async () => undefined),
  testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
  updateProviderCost: vi.fn(async () => undefined),
  updateProviderSettings: vi.fn(async () => undefined),
} satisfies ProviderActionHandlers;
export function mount(
  projectId: string,
  canManageProviders = true,
  supplied: IntegrationProviderData[] = providers,
) {
  return render(createElement(Editor, { canManageProviders, projectId, providers: supplied }));
}
