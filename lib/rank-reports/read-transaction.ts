/** Bounded read-only report budget. Never apply to writes, paid dispatch or global Prisma defaults.
 * The paired metadata reader removes duplicate round trips; this allowance absorbs network latency.
 * It is a transaction ceiling, not a response-time SLO. Pool admission keeps Prisma's 2 s default.
 */
export const REPORT_READ_TRANSACTION = Object.freeze({
  isolationLevel: "RepeatableRead" as const,
  maxWait: 2_000,
  timeout: 15_000,
});
