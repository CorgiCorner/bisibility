import { API_SCOPE_ORDER } from "./scope-policy";

export const apiKeyCreateProperties = {
  expires_in_days: {
    description: "Lifetime in days. Use null for no expiry.",
    enum: [30, 90, 365, null],
    type: ["integer", "null"],
  },
  name: { maxLength: 80, minLength: 1, type: "string" },
  scope: {
    default: "admin",
    description: "Access tier. When omitted, defaults to admin for backward compatibility.",
    enum: API_SCOPE_ORDER,
    type: "string",
  },
} as const;
