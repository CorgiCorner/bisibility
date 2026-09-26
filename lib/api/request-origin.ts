import type { ProviderCredentialKind, ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { ApiAuth } from "./auth";

export const SOURCE_HEADER = "x-bisibility-source";

export type ApiRequestOrigin = Readonly<{
  credentialKind: ProviderCredentialKind;
  credentialId: string;
  source: ProviderRequestSource;
  surface: "programmatic";
}>;

export function parseSourceHeader(value: string | null | undefined): ProviderRequestSource {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "sdk" || normalized === "cli" || normalized === "mcp") {
    return normalized;
  }
  return "api";
}

export function apiRequestOrigin(auth: ApiAuth, headers: Headers): ApiRequestOrigin {
  const credential =
    auth.kind === "project_key"
      ? { credentialKind: "project_key" as const, credentialId: auth.apiKey.id }
      : auth.oauthClientId
        ? { credentialKind: "oauth_client" as const, credentialId: auth.oauthClientId }
        : { credentialKind: "personal_token" as const, credentialId: auth.token.id };
  return {
    ...credential,
    source: parseSourceHeader(headers.get(SOURCE_HEADER)),
    surface: "programmatic",
  };
}

export function providerOrigin(origin: ApiRequestOrigin): ProviderRequestOrigin {
  return {
    credential: { id: origin.credentialId, kind: origin.credentialKind },
    source: origin.source,
  };
}
