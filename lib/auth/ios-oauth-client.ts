import { normalizeAuthorizationServerOrigin } from "@/lib/deployment/mcp-origin-contract";
import { IOS_OAUTH_CLIENT_ID, IOS_OAUTH_CLIENT_SCOPES, iosOAuthRedirectUri } from "./oauth-policy";

export const IOS_OAUTH_CLIENT_ROW_ID = "oc_bisibility_ios";

/**
 * Registration of the native iOS app as a public OAuth client (ADR-021): no secret, PKCE S256
 * only (the provider supports nothing else), an HTTPS redirect claimed through associated
 * domains, and only the fixed app scopes. The consent screen stays on.
 */
export function iosOAuthClientFields(authOrigin: string) {
  return {
    disabled: false,
    grantTypes: ["authorization_code", "refresh_token"],
    name: "Bisibility for iOS",
    public: true,
    redirectUris: [iosOAuthRedirectUri(normalizeAuthorizationServerOrigin(authOrigin))],
    requirePKCE: true,
    responseTypes: ["code"],
    scopes: [...IOS_OAUTH_CLIENT_SCOPES],
    skipConsent: false,
    tokenEndpointAuthMethod: "none",
    type: "native",
  };
}

export function iosOAuthClientCreateData(authOrigin: string) {
  return {
    ...iosOAuthClientFields(authOrigin),
    clientId: IOS_OAUTH_CLIENT_ID,
    contacts: [],
    id: IOS_OAUTH_CLIENT_ROW_ID,
    postLogoutRedirectUris: [],
  };
}
