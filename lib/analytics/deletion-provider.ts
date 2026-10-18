import "server-only";

export async function deleteServerPersons(_distinctIds: string[]): Promise<boolean> {
  return false;
}

export function shouldQueueAnalyticsPersonDeletion(): boolean {
  return false;
}
