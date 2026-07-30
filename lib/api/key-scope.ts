import type { ApiKeyScope } from "@/lib/schemas/apiKey";

export function scopesForTier(scope: ApiKeyScope): string[] {
  if (scope === "read") return ["read"];
  if (scope === "write") return ["read", "write"];
  return ["read", "write", "admin"];
}

export function tierFromScopes(scopes: readonly string[]): ApiKeyScope {
  if (scopes.includes("admin")) return "admin";
  if (scopes.includes("write")) return "write";
  return "read";
}
