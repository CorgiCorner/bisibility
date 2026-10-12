import type { ProviderUsageObserver } from "./usage";

/** Adapter-only fixture. Real financial authority is exercised by Postgres transport tests. */
export const testUsageObserver: ProviderUsageObserver = {
  begin: async (input) => input?.attemptKey ?? crypto.randomUUID(),
  beforeDispatch: async () => {},
  settle: async () => {},
};
