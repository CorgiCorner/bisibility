import { searchInsightsPropertyKey } from "./keys";

export type SearchInsightsConnectionStatus =
  | "connected"
  | "connected_no_property"
  | "needs_reauth"
  | "not_connected";

export function resolveSearchInsightsConnectionState(input: {
  providerStatus: string | null;
  storedProperty: string | undefined;
}): { propertyKey: string | null; status: SearchInsightsConnectionStatus } {
  if (!input.providerStatus || input.storedProperty === undefined) {
    return { propertyKey: null, status: "not_connected" };
  }
  const propertyKey = input.storedProperty ? searchInsightsPropertyKey(input.storedProperty) : null;
  if (input.providerStatus === "needs_reauth") {
    return { propertyKey, status: "needs_reauth" };
  }
  return {
    propertyKey,
    status: propertyKey ? "connected" : "connected_no_property",
  };
}
