export type AccountRateBucket = { bucketKey: string; limit: number; requireShared: boolean };

/** Standalone instances retain their operator-configured credential limits. */
export async function readAccountRateBucket(_ownerId: string): Promise<AccountRateBucket | null> {
  return null;
}
