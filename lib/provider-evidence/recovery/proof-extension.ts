import "server-only";
export async function settleHeldRecoveryProof(..._input: unknown[]): Promise<string> {
  return "platform_funding_unavailable";
}

export async function matchesOriginalRecoveryAccount(..._input: unknown[]): Promise<boolean> {
  return false;
}
