import type { ProviderChainEntry } from "@/lib/rank-check/provider-chain-order";

export type FirstCheckConnection = ProviderChainEntry & {
  credentialSource: string;
  credentialsEncrypted: string | null;
};
