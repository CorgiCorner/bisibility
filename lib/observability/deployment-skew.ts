type StorageAccess = Pick<Storage, "getItem" | "setItem">;
type Recovery = {
  stack?: string;
  scriptUrls: string[];
  deploymentId?: string;
  storage: StorageAccess;
  reload: () => void;
  url: string;
  now: number;
};

const RELOAD_TTL_MS = 60_000;

function deploymentIds(text: string): string[] {
  return Array.from(text.matchAll(/[?&]dpl=([a-zA-Z0-9_-]+)/g), (match) => match[1]);
}

export function hasDeploymentSkew(
  stack: string | undefined,
  scriptUrls: string[],
  deploymentId: string | undefined,
): boolean {
  const scriptIds = scriptUrls.flatMap(deploymentIds);
  const ids = new Set([...deploymentIds(stack ?? ""), ...scriptIds]);
  return ids.size > 1 || Boolean(deploymentId && scriptIds.some((id) => id !== deploymentId));
}

export function recoverDeploymentSkew(args: Recovery): boolean {
  if (!hasDeploymentSkew(args.stack, args.scriptUrls, args.deploymentId)) return false;
  const key = `deployment-skew-reload:${args.url}`;
  try {
    const previous = args.storage.getItem(key);
    const timestamp = previous === null ? Number.NaN : Number(previous);
    if (Number.isFinite(timestamp) && args.now - timestamp < RELOAD_TTL_MS) return false;
    args.storage.setItem(key, String(args.now));
    args.reload();
    return true;
  } catch {
    return false;
  }
}
