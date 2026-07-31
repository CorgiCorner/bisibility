export const API_SCOPE_VALUES = ["admin", "read", "write"] as const;

export type ApiScope = (typeof API_SCOPE_VALUES)[number];

export const API_SCOPE_ORDER = ["read", "write", "admin"] as const satisfies readonly ApiScope[];

const SCOPE_RANK = {
  admin: 3,
  read: 1,
  write: 2,
} as const satisfies Record<ApiScope, number>;

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && API_SCOPE_VALUES.includes(value as ApiScope);
}

export function apiScopeRank(scope: ApiScope) {
  return SCOPE_RANK[scope];
}

export function hasApiScope(scopes: readonly ApiScope[], required: ApiScope) {
  return scopes.some((scope) => apiScopeRank(scope) >= apiScopeRank(required));
}

export function scopesForTier(scope: ApiScope): ApiScope[] {
  return API_SCOPE_ORDER.filter((candidate) => apiScopeRank(candidate) <= apiScopeRank(scope));
}

export function tierFromScopes(scopes: readonly string[]): ApiScope {
  if (scopes.includes("admin")) return "admin";
  if (scopes.includes("write")) return "write";
  return "read";
}

export function grantedApiScopes(scopes: readonly string[]): readonly ApiScope[] {
  const tier = [...API_SCOPE_ORDER].reverse().find((scope) => scopes.includes(scope));
  return tier ? scopesForTier(tier) : [];
}
