export function snapshotRef(
  snapshot: { refs?: Record<string, { role: string; name?: string }> },
  role: string,
  name: RegExp,
): string;
export function captureDashboard(origin: string, projectRef: string, outputPath: string): Promise<void>;
