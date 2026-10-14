import "server-only";
import type { DevelopmentMapsTransportInput } from "@/lib/local-monitoring-host/development-transport-types";

export function developmentMapsTransport(
  _input: DevelopmentMapsTransportInput,
): typeof fetch | null {
  return null;
}
