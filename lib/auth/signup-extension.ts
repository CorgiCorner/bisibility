import "server-only";

/** Standalone account creation has no deployment-specific classification. */
export async function onUserCreated(
  _userId: string,
  _context: unknown,
): Promise<{ channel: "organic" | "paid" }> {
  return { channel: "organic" };
}
