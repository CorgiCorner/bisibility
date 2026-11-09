import "server-only";

export async function accountCapabilityAvailable(_userId: string): Promise<boolean> {
  return true;
}

export async function projectCapabilityAvailable(
  _projectId: string,
  _actorId?: string | null,
): Promise<boolean> {
  return true;
}
export async function assertAuthRequestCapability(_context: unknown): Promise<void> {}
