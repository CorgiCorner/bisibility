import "server-only";
import { prisma } from "@/lib/db/prisma";
import { listGoogleSites, refreshGoogleAccessToken } from "@/lib/providers/analytics/google-client";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { searchInsightsPropertyKey } from "@/lib/search-insights/keys";
import { type CheckResult, domainApex, domainHost } from "./model";

export function matchesSearchProperty(
  domain: string,
  property: {
    propertyKey: string;
    status: string;
    permissionLevel: string | null;
  },
  host = domain,
): boolean {
  if (
    property.status !== "active" ||
    !["siteOwner", "siteFullUser"].includes(property.permissionLevel ?? "")
  )
    return false;
  if (property.propertyKey.startsWith("sc-domain:"))
    return property.propertyKey.slice(10).toLowerCase() === domain;
  try {
    const url = new URL(property.propertyKey);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      url.hostname.toLowerCase() === host &&
      url.pathname === "/" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export async function checkSearchConsoleProof(
  projectId: string,
  domain: string,
): Promise<{ result: CheckResult; scope: string | null }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { domain: true },
  });
  if (!project?.domain) return { result: "missing", scope: null };
  let host: string;
  try {
    if (domainApex(project.domain) !== domain) return { result: "missing", scope: null };
    host = domainHost(project.domain);
  } catch {
    return { result: "missing", scope: null };
  }
  const connection = await prisma.providerConnection.findUnique({
    where: { projectId_provider: { projectId, provider: "gsc" } },
    select: { enabled: true, status: true, credentialsEncrypted: true },
  });
  if (!connection?.enabled || connection.status !== "connected")
    return { result: "missing", scope: null };
  let credentials: ReturnType<typeof decryptProviderCredentials>;
  try {
    credentials = decryptProviderCredentials(connection.credentialsEncrypted);
  } catch {
    return { result: "unavailable", scope: null };
  }
  if (!credentials.apiKey || !credentials.login) return { result: "missing", scope: null };
  const propertyKey = searchInsightsPropertyKey(credentials.login);
  if (!propertyKey) return { result: "missing", scope: null };
  const property = await prisma.searchInsightsPropertyRegistry.findUnique({
    where: { projectId_propertyKey: { projectId, propertyKey } },
  });
  if (property?.status !== "active") return { result: "missing", scope: null };
  try {
    const signal = AbortSignal.timeout(10_000);
    const sites = await listGoogleSites(
      await refreshGoogleAccessToken(credentials.apiKey, undefined, signal),
      signal,
    );
    const permissionLevel =
      sites.find((site) => searchInsightsPropertyKey(site.siteUrl) === property.propertyKey)
        ?.permissionLevel ?? null;
    const latestConnection = await prisma.providerConnection.findUnique({
      where: { projectId_provider: { projectId, provider: "gsc" } },
      select: { enabled: true, status: true, credentialsEncrypted: true },
    });
    if (
      !latestConnection?.enabled ||
      latestConnection.status !== "connected" ||
      latestConnection.credentialsEncrypted !== connection.credentialsEncrypted
    )
      return { result: "missing", scope: null };
    const updated = await prisma.searchInsightsPropertyRegistry.updateMany({
      where: { projectId, propertyKey: property.propertyKey, status: "active" },
      data: { permissionLevel },
    });
    return updated.count === 1 &&
      matchesSearchProperty(domain, { ...property, permissionLevel }, host)
      ? {
          result: "verified",
          scope: property.propertyKey.startsWith("sc-domain:") ? "domain" : `host:${host}`,
        }
      : { result: "missing", scope: null };
  } catch {
    return { result: "unavailable", scope: null };
  }
}
