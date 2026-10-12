import type { Actor } from "@/lib/auth/authorize";
import type { Figure } from "@usagekit/views";
export type ProviderUiAllocationScope = { actor: Actor; projectId: string };
export type PlatformAllocationEvidence = {
  /** Internal connection identity, mapped to a verified public alias by the neutral adapter. */
  connectionId: string;
  surface: "app" | "programmatic";
  used: Figure;
  reserved: Figure;
  available: Figure;
};
