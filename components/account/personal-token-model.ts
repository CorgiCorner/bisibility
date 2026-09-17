import type { IssuePersonalTokenInput } from "@/lib/schemas/personalToken";

export const personalTokenExpiryValues = [30, 90, 365, null] as const;

export const personalTokenScopeValues = [
  "read",
  "write",
  "admin",
] as const satisfies readonly IssuePersonalTokenInput["scope"][];
