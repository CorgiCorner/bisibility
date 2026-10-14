import { sameDefinitionBytes } from "@/lib/measurement-definitions/canonical";
import { hostDefinitionAdapter } from "@/lib/measurement-definitions/host-adapters";
import type { MeasurementSelection } from "@/lib/measurement-settings/ui-contracts";
import { SettingsHostError } from "./errors";
import type { SettingsSource } from "./source";

export function assertSettingsSelection(source: SettingsSource, selection: MeasurementSelection) {
  const adapter = hostDefinitionAdapter(selection.providerId);
  const geo = source.markets.find((row) => row.location.canonicalKey === selection.geoId)?.location;
  const configured = source.policy.config?.adapters.find(
    (row) => row.providerId === selection.providerId,
  );
  const connection = source.chain.find((row) => row.provider === selection.providerId);
  if (
    !adapter ||
    !geo ||
    !connection ||
    !configured ||
    !sameDefinitionBytes(adapter.policy, configured) ||
    selection.surface !== "web_serp" ||
    adapter.capability.capabilityVersion !== selection.capabilityVersion ||
    !adapter.capability.devices.includes(selection.device) ||
    !adapter.capability.locationKinds.includes(geo.kind) ||
    geo.languageCode !== selection.languageCode ||
    !adapter.capability.depths.includes(selection.depth) ||
    selection.depth > adapter.capability.maxDepth
  )
    throw new SettingsHostError("unsupported_capability");
  return { adapter, geo, connection };
}
/** UI `all` means all real project targets in the explicit lens, never virtual or cloned targets. */
export function settingsManualSpec(source: SettingsSource, selection: MeasurementSelection) {
  const { geo } = assertSettingsSelection(source, selection);
  return {
    kind: "filter" as const,
    v: 1 as const,
    query: {
      grouped: false as const,
      lens: { device: selection.device, locationId: geo.id },
      page: 1,
      pageSize: 25 as const,
      savedViewId: null,
      search: "",
      sort: { direction: "asc" as const, field: "keyword" as const },
      filters: {
        change: "any" as const,
        contains: "",
        intents: [],
        lastCheck: "any" as const,
        position: [],
        serp: [],
        tags: [],
        topics: [],
        urlChanged: false,
        volMax: 50,
        volMin: 0,
        wrongUrl: false,
      },
    },
  };
}
