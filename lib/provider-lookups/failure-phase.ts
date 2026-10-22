/** Retain failure location without wrapping errors or changing admission control flow. */
const phases = new WeakMap<object, "before_dispatch" | "provider" | "persistence">();

export function markProviderFailurePhase(
  error: unknown,
  phase: "before_dispatch" | "provider" | "persistence",
) {
  if (error && typeof error === "object") phases.set(error, phase);
  return error;
}

export function providerFailurePhase(error: unknown) {
  return error && typeof error === "object" ? phases.get(error) : undefined;
}
