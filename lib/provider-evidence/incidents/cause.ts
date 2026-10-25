/** Stable project-local grouping: original canonical provider + Meter feature.
 * Never use a dimension, run, credential, customer identity or retry reason.
 */
export function incidentCause(input: { provider: string; operation: string }): string {
  if (![input.provider, input.operation].every((part) => /^[a-z][a-z0-9_]{0,63}$/.test(part)))
    throw new Error("Incident cause requires canonical provider and Meter feature");
  return `${input.provider}:${input.operation}`;
}
