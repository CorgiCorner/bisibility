import { getDeployProviderMapper } from "./providers";
import { firstString, pathList, record } from "./providers/_shared";
import type { DeployEvent, DeploySignalPayload } from "./types";

export type { DeployEvent, DeploySignalPayload } from "./types";

const MAX_PATHS = 50;
const PAYLOAD_LIMIT_BYTES = 8 * 1024;

function normalizeProvider(provider: string | null | undefined) {
  const normalized = provider
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .slice(0, 80);
  return normalized || null;
}

function providerFromBody(body: unknown) {
  return normalizeProvider(firstString(record(body)?.provider));
}

function genericDeployEvent(body: unknown, provider: string): DeployEvent | null {
  const root = record(body);
  if (!root) return null;

  const deploymentId = firstString(root.deployment_id, root.deploymentId);
  const environment = firstString(root.environment);
  const paths = pathList(root.paths, MAX_PATHS);
  const url = firstString(root.url);
  if (!deploymentId && !environment && !paths && !url) {
    return null;
  }
  return {
    ...(deploymentId ? { deploymentId } : {}),
    ...(environment ? { environment } : {}),
    ...(paths ? { paths } : {}),
    provider,
    ...(url ? { url } : {}),
  };
}

export function parseDeployEvent(body: unknown, provider: string | null): DeployEvent | null {
  const normalized = normalizeProvider(provider);
  const mapper = getDeployProviderMapper(normalized);
  if (mapper) return mapper.parse(body);

  return genericDeployEvent(body, normalized ?? providerFromBody(body) ?? "generic");
}

export function shouldIgnoreDeployEvent(body: unknown, provider: string | null) {
  return getDeployProviderMapper(normalizeProvider(provider))?.isIgnored(body) ?? false;
}

export function httpSignalUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function trimValue(value: string | undefined, limit: number) {
  if (!value) return undefined;
  return value.length > limit ? value.slice(0, limit) : value;
}

function payloadBytes(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function compactPayload(event: DeployEvent, paths: string[] | undefined): DeploySignalPayload {
  return {
    ...(trimValue(event.deploymentId, 512)
      ? { deploymentId: trimValue(event.deploymentId, 512) }
      : {}),
    ...(trimValue(event.environment, 120)
      ? { environment: trimValue(event.environment, 120) }
      : {}),
    ...(paths?.length ? { paths } : {}),
    provider: trimValue(event.provider, 80) ?? "generic",
  };
}

export function deploySignalPayload(event: DeployEvent): DeploySignalPayload {
  let paths = event.paths
    ?.map((path) => trimValue(path, 256) ?? "")
    .filter(Boolean)
    .slice(0, MAX_PATHS);
  let payload = compactPayload(event, paths);

  while (paths?.length && payloadBytes(payload) > PAYLOAD_LIMIT_BYTES) {
    paths = paths.slice(0, -1);
    payload = compactPayload(event, paths);
  }

  return payload;
}
