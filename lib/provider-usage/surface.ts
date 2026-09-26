import type { ProviderRequestSource } from "./tag";

export const PROVIDER_REQUEST_SURFACES = ["app", "programmatic"] as const;
export type ProviderRequestSurface = (typeof PROVIDER_REQUEST_SURFACES)[number];

export const PROVIDER_CREDENTIAL_KINDS = ["project_key", "personal_token", "oauth_client"] as const;
export type ProviderCredentialKind = (typeof PROVIDER_CREDENTIAL_KINDS)[number];

export const SOURCES_BY_SURFACE: Readonly<
  Record<ProviderRequestSurface, readonly ProviderRequestSource[]>
> = {
  app: ["app", "worker"],
  programmatic: ["api", "sdk", "cli", "mcp"],
};

export type ProviderCredential = Readonly<{ id: string; kind: ProviderCredentialKind }>;
/** Where a provider request came from, as the service layer sees it. */
export type ProviderRequestOrigin = Readonly<{
  credential?: ProviderCredential;
  source: ProviderRequestSource;
}>;
/** The origin of every session-authenticated (UI) request. */
export const APP_REQUEST_ORIGIN: ProviderRequestOrigin = { source: "app" };

export function surfaceOf(
  source: ProviderRequestSource | null | undefined,
): ProviderRequestSurface {
  if (SOURCES_BY_SURFACE.programmatic.includes(source as ProviderRequestSource)) {
    return "programmatic";
  }
  return "app";
}
