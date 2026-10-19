import { operationPolicy } from "./operation-policy-registry";
import type { ApiScope } from "./scope-policy";

const APP_OAUTH_SCOPE: Partial<Record<ApiScope, string>> = {
  read: "api:read",
  write: "api:write",
};

/** ADR-021: opaque OAuth tokens of the first-party app client, accepted alongside PATs. */
const appOAuthSecuritySchemes = {
  AppOAuth: {
    description:
      "OAuth 2.0 for the first-party Bisibility apps only; other clients cannot obtain these scopes. Use the authorization code flow with PKCE (S256) and no client secret, and do not send a `resource` parameter: `/api/v1` accepts only the opaque access tokens issued without one. Access tokens expire after 15 minutes. Refresh tokens rotate on every use, and replaying a used refresh token revokes the whole grant. To sign out, POST the refresh token with `token_type_hint=refresh_token` and the `client_id` to `/api/auth/oauth2/revoke`. Account deletion additionally requires a sign-in from the last 10 minutes (authorize again with `prompt=login`); otherwise it fails with 403 and `details.code` `reauthentication_required`. Admin operations are not available to app tokens.",
    flows: {
      authorizationCode: {
        authorizationUrl: "/api/auth/oauth2/authorize",
        refreshUrl: "/api/auth/oauth2/token",
        scopes: {
          "api:read": "Read the account and projects visible to the user.",
          "api:write": "Read, and change projects within the user's role. Implies api:read.",
        },
        tokenUrl: "/api/auth/oauth2/token",
      },
    },
    type: "oauth2",
  },
};

type Operation = { operationId?: string; security?: Record<string, string[]>[] };

type ScopeForOperation = (operationId: string) => ApiScope | undefined;

function withAppScope(value: unknown, scopeForOperation: ScopeForOperation) {
  const operation = value as Operation;
  const requiredScope = operation.operationId && scopeForOperation(operation.operationId);
  const scope = requiredScope ? APP_OAUTH_SCOPE[requiredScope] : undefined;
  const security = operation.security;
  if (!scope || !security?.some((entry) => "PersonalAccessToken" in entry)) return value;
  return { ...operation, security: [...security, { AppOAuth: [scope] }] };
}

type Paths = Record<string, Record<string, unknown>>;

/** Offer the app scheme wherever a personal access token works below the admin tier. */
export function withAppOAuth<T extends { components: { securitySchemes: object }; paths: Paths }>(
  document: T,
  scopeForOperation: ScopeForOperation = (operationId) =>
    operationId === "deleteMe"
      ? "write"
      : operationPolicy[operationId as keyof typeof operationPolicy]?.requiredScope,
): T {
  const paths = Object.fromEntries(
    Object.entries(document.paths).map(([path, methods]) => [
      path,
      Object.fromEntries(
        Object.entries(methods).map(([method, value]) => [
          method,
          withAppScope(value, scopeForOperation),
        ]),
      ),
    ]),
  );
  return {
    ...document,
    components: {
      ...document.components,
      securitySchemes: { ...document.components.securitySchemes, ...appOAuthSecuritySchemes },
    },
    paths,
  };
}
