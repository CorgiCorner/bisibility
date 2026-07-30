import type { DeployEvent } from "@/lib/ingest/types";
import { firstString, record } from "./_shared";

const AMPLIFY_DEPLOY_DETAIL_TYPE = "Amplify Deployment Status Change";
const BRANCH_DOMAIN_PATTERN = /^[a-zA-Z0-9-]+$/;

function amplifyDetail(body: unknown) {
  const root = record(body);
  return { detail: record(root?.detail) ?? root, root };
}

function amplifyUrl(appId: string | undefined, branchName: string | undefined) {
  if (!appId || !branchName || !BRANCH_DOMAIN_PATTERN.test(branchName)) {
    return undefined;
  }
  return `https://${branchName}.${appId}.amplifyapp.com`;
}

function isAmplifyEnvelope(root: Record<string, unknown> | null) {
  return root?.source === "aws.amplify" || root?.["detail-type"] === AMPLIFY_DEPLOY_DETAIL_TYPE;
}

export function isIgnoredAmplifyDeploy(body: unknown) {
  const { detail, root } = amplifyDetail(body);
  const jobStatus = firstString(detail?.jobStatus);
  const isRecognizable = typeof jobStatus === "string" || isAmplifyEnvelope(root);
  return isRecognizable && jobStatus !== "SUCCEED";
}

export function parseAmplifyDeploy(body: unknown): DeployEvent | null {
  const { detail, root } = amplifyDetail(body);
  if (!detail || firstString(detail.jobStatus) !== "SUCCEED") {
    return null;
  }

  const appId = firstString(detail.appId);
  const deploymentId = firstString(detail.jobId, root?.id);
  const environment = firstString(detail.branchName);
  const url = amplifyUrl(appId, environment);

  return {
    ...(deploymentId ? { deploymentId } : {}),
    ...(environment ? { environment } : {}),
    provider: "amplify",
    ...(url ? { url } : {}),
  };
}
