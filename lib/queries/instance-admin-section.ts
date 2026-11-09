import "server-only";

export async function loadDashboardSection<T>(
  section: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<{ available: boolean; data: T }> {
  try {
    return { available: true, data: await load() };
  } catch (error) {
    console.error("[instance-admin] section unavailable", { error, section });
    return { available: false, data: fallback };
  }
}
