import type { ProviderCredentials } from "./types";

/** Synthetic adapters retain explicit zero usage through the ordinary accounting port. */
export async function syntheticProviderResult<T>(
  credentials: ProviderCredentials | undefined,
  operation: () => T | Promise<T>,
): Promise<T> {
  const observer = credentials?.usageObserver;
  if (!observer) return operation();
  const id = await observer.begin({ attemptKey: crypto.randomUUID() });
  await observer.beforeDispatch?.(id);
  let result: T;
  try {
    result = await operation();
  } catch (error) {
    await observer.settle(id, {
      cached: false,
      failed: true,
      costCents: 0,
      quantity: 0,
      providerRequestId: `synthetic:${id}`,
    });
    throw error;
  }
  await observer.settle(id, {
    cached: false,
    failed: false,
    costCents: 0,
    quantity: 0,
    providerRequestId: `synthetic:${id}`,
  });
  return result;
}
