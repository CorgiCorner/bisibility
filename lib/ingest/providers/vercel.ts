import type { DeployEvent } from "@/lib/ingest/types";
import { firstString, httpsUrl, pathList, record } from "./_shared";

const MAX_PATHS = 50;

export function isIgnoredVercelDeploy(body: unknown) {
  const root = record(body);
  return typeof root?.type === "string" && root.type !== "deployment.succeeded";
}

export function parseVercelDeploy(body: unknown): DeployEvent | null {
  const root = record(body);
  if (root?.type !== "deployment.succeeded") {
    return null;
  }

  const payload = record(root.payload);
  const deployment = record(payload?.deployment) ?? record(payload);
  if (!deployment) return null;

  const meta = record(deployment.meta);
  const deploymentId = firstString(deployment.id, payload?.id, meta?.deploymentId);
  const environment = firstString(deployment.target, deployment.environment, payload?.target);
  const paths = pathList(deployment.paths ?? meta?.paths, MAX_PATHS);
  const url = httpsUrl(deployment.url ?? payload?.url);

  return {
    ...(deploymentId ? { deploymentId } : {}),
    ...(environment ? { environment } : {}),
    ...(paths ? { paths } : {}),
    provider: "vercel",
    ...(url ? { url } : {}),
  };
}
