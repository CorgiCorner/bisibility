import "server-only";

// Must run before the process.env reads in this module - fills runtime env on
// platforms that omit it at request time (no-op where the platform injects env).
import "@/lib/deployment/runtime-env.generated";

export type DeploymentMode = "self-host" | "cloud";
export type DeploymentDataRegion = "eu" | "us";

export function deploymentMode(value = process.env.DEPLOYMENT_MODE): DeploymentMode {
  return value?.trim().toLowerCase() === "cloud" ? "cloud" : "self-host";
}

export function deploymentDataRegion(value = process.env.DATA_REGION): DeploymentDataRegion {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "us" || normalized?.startsWith("us-")) {
    return "us";
  }

  return "eu";
}

export function deploymentDataRegionLabel(value = process.env.DATA_REGION) {
  return deploymentDataRegion(value).toUpperCase();
}

export function dataResidencyMessage(value = process.env.DATA_REGION) {
  // Claim a region only when DATA_REGION is explicitly set (the regional cells
  // set it). The generic us-east deploy stays silent rather than claim a region.
  if (!value?.trim()) {
    return "";
  }
  return `Your data is stored and processed in the ${deploymentDataRegionLabel(value)}.`;
}

export const isCloud = deploymentMode() === "cloud";
export const isSelfHost = !isCloud;
