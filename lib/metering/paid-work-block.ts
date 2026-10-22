type BlockResult = {
  connection: { id: string } | null;
  blocked: boolean | null;
};

/**
 * Rank-tracker block flag. Unsplit projects stay blocked when any scanned connection is.
 * Split projects follow only the primary SERP connection, which is the one rank checks spend.
 */
export function selectPaidWorkBlocked(input: {
  split: boolean;
  primaryConnectionId: string | null;
  connectionCount: number;
  connectionLimit: number;
  statuses: readonly BlockResult[];
}): boolean | null {
  if (!input.split) {
    if (input.statuses.some((result) => result.blocked === true)) return true;
    if (
      input.connectionCount > input.connectionLimit ||
      input.statuses.some((result) => result.blocked === null)
    )
      return null;
    return false;
  }
  const primary = input.statuses.filter(
    (result) => result.connection?.id === input.primaryConnectionId,
  );
  if (input.primaryConnectionId && primary.length === 0) return null;
  if (primary.some((result) => result.blocked === true)) return true;
  if (primary.some((result) => result.blocked === null)) return null;
  return false;
}
