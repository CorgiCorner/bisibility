import "server-only";

/** Operators run one consistent app version across all routes and processes. */
export function privateViewCreationCapability() {
  return { canCreatePrivate: true, reason: null };
}
