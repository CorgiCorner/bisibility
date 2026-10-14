/** Mirrors the active registry branches. A synthetic branch never certifies a real provider. */
export function localSequenceProviderEnabled(nodeEnv: string | undefined, explicitFlag?: string) {
  return nodeEnv !== "production" && (nodeEnv !== "test" || explicitFlag === "1");
}
export function syntheticSerpAdapterActive(providerId: string) {
  const known =
    providerId === "dataforseo" ||
    providerId === "serpapi" ||
    (providerId === "local-sequence" &&
      localSequenceProviderEnabled(process.env.NODE_ENV, process.env.BISIBILITY_DEV_SERP_PROVIDER));
  return known && (process.env.BISIBILITY_FAKE_PROVIDER === "1" || providerId === "local-sequence");
}
export const SYNTHETIC_SERP_ADAPTER_VERSION = "synthetic-serp-observation-v1";
export const SYNTHETIC_SERP_CAPABILITY_VERSION = "synthetic-web-serp-v1";
