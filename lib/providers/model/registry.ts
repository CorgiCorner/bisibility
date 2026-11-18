import "server-only";
import type { ModelProvider, NativeModelProviderId } from "./types";

export type ModelProviderLoader = () => Promise<ModelProvider>;
type Registration = { load: ModelProviderLoader; adapter?: Promise<ModelProvider> };
// Keep the existing Connect/Test deadline independent of a shared cold load.
const CALLER_TIMEOUT_MS = 15_000;
// Match MODEL_TRANSPORT_LIMITS.timeoutMs in transport-input.ts: allow cold startup,
// but release a hung load after one maximum model-request lifetime.
const LOAD_TIMEOUT_MS = 120_000;
const unavailable = () => new Error("Model provider is not available yet.");
const registrations = new Map<NativeModelProviderId, Registration>();

/** Integration supplies real loaders only after the adapter's gates pass. */
export function registerModelProvider(id: NativeModelProviderId, load: ModelProviderLoader) {
  const registration: Registration = { load };
  registrations.set(id, registration);
  return () => {
    if (registrations.get(id) === registration) registrations.delete(id);
  };
}

/** Checks registration only; listing must never load an adapter. */
export function isModelProviderRegistered(id: string): boolean {
  return registrations.has(id as NativeModelProviderId);
}

function loadAdapter(id: NativeModelProviderId, registration: Registration) {
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(unavailable()), LOAD_TIMEOUT_MS);
    timer.unref?.();
  });
  const loaded = Promise.resolve().then(async () => {
    const adapter = await registration.load();
    if (adapter.id !== id) throw unavailable();
    return adapter;
  });
  const pending = Promise.race([loaded, expired])
    .catch(() => {
      if (registration.adapter === pending) delete registration.adapter;
      throw unavailable();
    })
    .finally(() => clearTimeout(timer));
  return pending;
}

/** No loader is installed by default. Catalog reads never call this resolver. */
export async function getModelProvider(
  id: NativeModelProviderId,
  signal?: AbortSignal,
): Promise<ModelProvider | null> {
  const registration = registrations.get(id);
  if (!registration) return null;
  registration.adapter ??= loadAdapter(id, registration);
  let onAbort = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(unavailable());
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    } else {
      timer = setTimeout(onAbort, CALLER_TIMEOUT_MS);
      timer.unref?.();
    }
  });
  return Promise.race([registration.adapter, aborted]).finally(() => {
    signal?.removeEventListener("abort", onAbort);
    clearTimeout(timer);
  });
}
