import "server-only";
import { dataforseoRecoveryAdapter } from "@/lib/provider-evidence/dataforseo/adapter";
import type { ProviderRecoveryAdapter } from "./adapter";

export function createRecoveryAdapterRegistry(adapters: readonly ProviderRecoveryAdapter[]) {
  const registry = new Map<string, ProviderRecoveryAdapter>();
  for (const adapter of adapters) {
    if (registry.has(adapter.provider)) throw new Error("Duplicate recovery adapter");
    registry.set(adapter.provider, adapter);
  }
  return { get: (provider: string) => registry.get(provider) };
}
export const recoveryAdapters = createRecoveryAdapterRegistry([dataforseoRecoveryAdapter]);
