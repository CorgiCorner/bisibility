import type { MeasurementCapability } from "@/lib/measurement-settings/capabilities";
import { measurementCapability } from "@/lib/measurement-settings/capabilities";
import {
  DATAFORSEO_OBSERVATION_ADAPTER_VERSION,
  SERPAPI_OBSERVATION_ADAPTER_VERSION,
} from "@/lib/providers/serp/observation-adapter-versions";
import {
  localSequenceProviderEnabled,
  SYNTHETIC_SERP_ADAPTER_VERSION,
  SYNTHETIC_SERP_CAPABILITY_VERSION,
  syntheticSerpAdapterActive,
} from "@/lib/providers/serp/synthetic-mode";
import type { PersistedDefinitionPolicy } from "./model";

type AdapterPolicy = PersistedDefinitionPolicy["adapters"][number];
export type HostDefinitionAdapter = Readonly<{
  capability: MeasurementCapability;
  policy: AdapterPolicy;
  synthetic: boolean;
}>;
/** Product manifest plus the actual observation producer, never billing/catalog metadata alone. */
export function hostDefinitionAdapter(providerId: string): HostDefinitionAdapter | null {
  const manifest = measurementCapability(providerId, "web_serp");
  if (!manifest) return null;
  if (syntheticSerpAdapterActive(providerId))
    return {
      synthetic: true,
      capability: {
        ...manifest,
        capabilityVersion: SYNTHETIC_SERP_CAPABILITY_VERSION,
        adapterVersion: SYNTHETIC_SERP_ADAPTER_VERSION,
        nativeBillingUnit: "test",
        resultKinds: ["organic_result"],
        async: false,
        evidence: {
          ...manifest.evidence,
          stableIds: "unavailable",
          positions: "organic_group",
          observedTime: "synthetic_time",
        },
      },
      policy: {
        providerId,
        capabilityVersion: SYNTHETIC_SERP_CAPABILITY_VERSION,
        adapterVersion: SYNTHETIC_SERP_ADAPTER_VERSION,
        nativeFindTargetsIn: "none",
      },
    };
  if (providerId !== "dataforseo" && providerId !== "serpapi") return null;
  const producerVersion =
    providerId === "dataforseo"
      ? DATAFORSEO_OBSERVATION_ADAPTER_VERSION
      : SERPAPI_OBSERVATION_ADAPTER_VERSION;
  if (manifest.adapterVersion !== producerVersion) return null;
  return {
    synthetic: false,
    capability: manifest,
    policy: {
      providerId,
      capabilityVersion: manifest.capabilityVersion,
      adapterVersion: manifest.adapterVersion,
      nativeFindTargetsIn: providerId === "dataforseo" ? "with_subdomains_on_match" : "none",
    },
  };
}
/** Server-owned adapter configuration. It does not configure or send anything. */
export function hostDefinitionAdapters(): AdapterPolicy[] {
  const providers = ["dataforseo", "serpapi"];
  if (localSequenceProviderEnabled(process.env.NODE_ENV, process.env.BISIBILITY_DEV_SERP_PROVIDER))
    providers.push("local-sequence");
  return providers.flatMap((id) => {
    const entry = hostDefinitionAdapter(id);
    return entry ? [entry.policy] : [];
  });
}
