import type { DeployEvent } from "@/lib/ingest/types";
import { firstString, httpsUrl, pathList, record } from "./_shared";

const MAX_PATHS = 50;

export function isIgnoredNetlifyDeploy(body: unknown) {
  const root = record(body);
  return typeof root?.state === "string" && root.state !== "ready";
}

export function parseNetlifyDeploy(body: unknown): DeployEvent | null {
  const root = record(body);
  if (root?.state !== "ready") {
    return null;
  }

  const deploymentId = firstString(root.id, root.deploy_id, root.commit_ref);
  const environment = firstString(root.context, root.branch);
  const paths = pathList(root.paths, MAX_PATHS);
  const url = httpsUrl(root.ssl_url ?? root.url);

  return {
    ...(deploymentId ? { deploymentId } : {}),
    ...(environment ? { environment } : {}),
    ...(paths ? { paths } : {}),
    provider: "netlify",
    ...(url ? { url } : {}),
  };
}
