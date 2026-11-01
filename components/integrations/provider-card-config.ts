import type { IntegrationProviderData } from "@/lib/integrations/types";

export function providerConsumerStatuses(provider: IntegrationProviderData) {
  return provider.id === "gsc" &&
    (provider.status === "connected" || provider.status === "needs_reauth")
    ? provider.consumerStatuses
    : undefined;
}

// A lost property grant or missing scope gets its remedy, not the generic reconnect copy.
export function reauthMessageKey(provider: Pick<IntegrationProviderData, "id" | "reauthReason">) {
  if (provider.reauthReason === "permission") return "oauth.googlePropertyPermission";
  if (provider.reauthReason === "scope") return "oauth.googlePropertyScope";
  if (provider.id === "gsc") return "provider.reauthGsc";
  return provider.id === "ga4" ? "provider.reauthGa4" : "provider.reauthGeneric";
}

export const actionLabels = {
  connected: "Manage",
  needs_reauth: "Reconnect",
  optional: "Connect",
  planned: "Connect",
  ready: "Connect",
} as const;

export const outlineActionStyle = {
  "--control-color": "var(--fg-muted)",
  "--control-hover-border-color": "var(--accent)",
  "--control-hover-color": "var(--accent-text)",
  "--control-focus-border-color": "var(--accent)",
  "--control-focus-color": "var(--accent-text)",
} as const;

export const reauthCopy: Record<string, string> = {
  gsc: "Google authorization is no longer valid. Reconnect to resume Search Insights and traffic enrichment.",
  ga4: "Google authorization is no longer valid. Reconnect to resume traffic syncs.",
};
