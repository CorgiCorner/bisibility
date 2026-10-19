import "server-only";

/** Self-hosted instances hold no deployment-owned provider credentials, so none are withheld. */
export async function ownProviderKeysRequired(_userId: string, _db?: unknown): Promise<boolean> {
  return false;
}
