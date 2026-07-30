import type { DeployEvent } from "@/lib/ingest/types";
import { isIgnoredAmplifyDeploy, parseAmplifyDeploy } from "./amplify";
import { isIgnoredNetlifyDeploy, parseNetlifyDeploy } from "./netlify";
import { isIgnoredVercelDeploy, parseVercelDeploy } from "./vercel";

export type DeployProviderMapper = {
  isIgnored(body: unknown): boolean;
  parse(body: unknown): DeployEvent | null;
};

const deployProviderMappers: Record<string, DeployProviderMapper> = {
  amplify: {
    isIgnored: isIgnoredAmplifyDeploy,
    parse: parseAmplifyDeploy,
  },
  netlify: {
    isIgnored: isIgnoredNetlifyDeploy,
    parse: parseNetlifyDeploy,
  },
  vercel: {
    isIgnored: isIgnoredVercelDeploy,
    parse: parseVercelDeploy,
  },
};

export function getDeployProviderMapper(name: string | null | undefined) {
  return name ? (deployProviderMappers[name] ?? null) : null;
}
