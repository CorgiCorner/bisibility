import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  assertComparisonAccess,
  assertComparisonHistoryWrite,
} from "@/lib/provider-comparison/access";
import { connectionResponseRecorder } from "@/lib/provider-responses/connection";
import { deploymentProviderCredentials } from "@/lib/providers/credential-extension";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { assertOwnKeyStored } from "@/lib/providers/own-key-guard";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { dataForSeoRedirectTransport } from "@/lib/providers/serp/dataforseo-redirect-transport";
import { resolveRedirectRows } from "@/lib/providers/serp/redirect-resolution";
import type { SerpUrlRepairInput } from "@/lib/temporal/serp-url-repair-client";
import { storedUrlRepair, type UrlRepairState } from "./model";
import { loadRepairSource, writeRepairSource } from "./source";

export async function repairSerpUrls(input: SerpUrlRepairInput & { runId: string }) {
  const source = await prisma.$transaction(async (tx) => {
    await assertComparisonAccess(tx, input.projectId, input.actorId, true);
    const source = await loadRepairSource(tx, input.projectId, input.target);
    if (source.hash !== input.sourceHash) throw new Error("Saved results changed.");
    const previous = storedUrlRepair(source.body._urlRepair);
    const state: UrlRepairState = {
      version: 1,
      workflowId: input.workflowId,
      runId: input.runId,
      status: "running",
      updatedAt: new Date().toISOString(),
      mappings: previous?.mappings ?? {},
      resolved: previous?.resolved ?? 0,
      unresolved: source.rows.length,
    };
    await writeRepairSource(tx, input.target, source, state);
    return { ...source, previous: state };
  });
  const connection = await prisma.providerConnection.findFirst({
    where: {
      projectId: input.projectId,
      provider: "dataforseo",
      enabled: true,
      status: "connected",
    },
  });
  if (!connection) throw new Error("Connect DataForSEO to resolve saved URLs.");
  if (connection.credentialSource === "own")
    await assertOwnKeyStored({
      projectId: input.projectId,
      provider: "dataforseo",
      capability: "free_result_enrichment",
      credentialsEncrypted: connection.credentialsEncrypted,
    });
  const credentials =
    connection.credentialSource === "hosted"
      ? await deploymentProviderCredentials("dataforseo", "free_result_enrichment")
      : resolveProviderCredentials("dataforseo", connection.credentialsEncrypted);
  if (!credentials?.login || !credentials.password)
    throw new Error("Conversion credentials unavailable.");
  const captureResponse = connectionResponseRecorder(connection.id, "dataforseo", "url_resolution");
  const transport = dataForSeoRedirectTransport({ ...credentials, captureResponse }, 120_000);
  const result = await resolveRedirectRows(
    source.rows,
    async (urls) => {
      const limit = await consumeProviderLimit("dataforseo", credentials, {
        projectId: input.projectId,
      });
      if (!limit.success) throw new Error("Conversion rate limited.");
      return transport(urls);
    },
    source.previous.mappings,
  );
  const resolved = result.resolutions.filter((row) => row.status === "resolved").length;
  const unresolved = result.resolutions.filter((row) => row.status === "unresolved").length;
  await prisma.$transaction(async (tx) => {
    await assertComparisonHistoryWrite(tx, input.projectId, input.actorId);
    const current = await loadRepairSource(tx, input.projectId, input.target);
    const lease = storedUrlRepair(current.body._urlRepair);
    if (current.hash !== input.sourceHash || lease?.runId !== input.runId)
      throw new Error("Saved results changed.");
    await writeRepairSource(tx, input.target, current, {
      ...source.previous,
      status: "completed",
      updatedAt: new Date().toISOString(),
      mappings: result.mappings,
      resolved,
      unresolved,
    });
  });
  return { resolved, unresolved };
}
