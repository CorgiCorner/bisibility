import type { ConnectionRecoveryView } from "@/lib/integrations/provider-recovery/types";
import type { ProviderConnectionRow } from "./integration-provider-drawer";

export function integrationRecoveryView(
  view: ConnectionRecoveryView,
  connectionId: string,
  connections: ProviderConnectionRow[],
  recovery: ReadonlyMap<string, ConnectionRecoveryView | null>,
) {
  const anotherActive = Boolean(
    view.fallbackProviders?.some((provider) =>
      connections.some(
        (other) =>
          other.id !== connectionId &&
          other.provider === provider &&
          other.kind === "serp" &&
          other.status === "connected" &&
          other.enabled &&
          !recovery.get(other.id)?.paused,
      ),
    ),
  );
  return { ...view, anotherActive };
}
