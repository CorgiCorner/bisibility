import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { reservePaidAttempts } from "@/lib/metering/paid-admission";
import type { PaidAttemptInput } from "@/lib/metering/paid-attempt-types";
import { markPaidAttemptDispatch } from "@/lib/metering/paid-dispatch";
import { ensureProjectSpendingBudget } from "@/lib/metering/project-budget-bootstrap";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { dataForSeoGoogleParams } from "@/lib/providers/serp/dataforseo-client";
import { locationForProvider } from "@/lib/rank-check/fallback-location";
import { serpRankLocation } from "@/lib/serp/location";
import { configureDefinitionPolicy } from "./policy-config";
import { definitionDatabaseFixture } from "./postgres.test-fixture";
import { assertDefinitionAtDispatch, captureDefinitionBeforeIo } from "./producer";
import { definitionWorkerHost, type WorkerDefinitionScope } from "./worker-authority";
import { claimDefinitionPaidCall } from "./worker-claim";
import { captureDefinitionItemIntent } from "./worker-intent";
import { retainNativeDefinitionRequest } from "./worker-request-proof";
import { workerDefinitionOwner } from "./worker-session";

/** Full actual schema and canonical native lease; only worker context/transport/entitlement config are synthetic. */
export async function workerNativeFixture(
  invocation: { workflowId: string; runId: string },
  options: { configurePolicy?: boolean } = {},
) {
  const f = await definitionDatabaseFixture();
  try {
    const ready = await f.client.query(
      "SELECT to_regclass('measurement_snapshot_request_bindings') IS NOT NULL AS ready",
    );
    if (!ready.rows[0].ready)
      throw new Error(
        "Root must materialize worker/snapshot schema proposal before running this source suite.",
      );
    const config = structuredClone(f.config);
    config.adapters = [
      {
        providerId: "dataforseo",
        capabilityVersion: "web-serp-v1",
        adapterVersion: "dataforseo-observation-v1",
        nativeFindTargetsIn: "with_subdomains_on_match",
      },
    ];
    const epoch = await f.client.query(
      'SELECT "measurementPolicyEpoch"::text AS epoch FROM projects WHERE id=$1',
      [f.project.project.id],
    );
    if (options.configurePolicy !== false)
      await configureDefinitionPolicy(
        f.db,
        f.project.writerContext,
        { projectId: f.project.project.publicId, expectedPolicyEpoch: epoch.rows[0].epoch, config },
        f.host.recordMutation,
      );
    await f.db.projectDefaults.create({
      data: { projectId: f.project.project.id, frequency: "daily", timezone: "UTC", serpDepth: 20 },
    });
    await f.db.projectMarket.create({
      data: {
        publicId: makePublicId("pmkt"),
        projectId: f.project.project.id,
        locationId: f.observation.location.id,
        status: "active",
      },
    });
    const connection = await f.db.providerConnection.create({
      data: {
        projectId: f.project.project.id,
        publicId: makePublicId("conn"),
        provider: "dataforseo",
        kind: "serp",
        status: "connected",
        enabled: true,
        credentialSource: "own",
        credentialsEncrypted: "synthetic-opaque-ciphertext",
      },
    });
    if (!connection.credentialsEncrypted || !connection.publicId)
      throw new Error("Synthetic connection credentials are required.");
    const credentialVersion = ownCredentialVersion(
      connection.provider,
      connection.id,
      connection.credentialsEncrypted,
    );
    if (!credentialVersion) throw new Error("Synthetic credential version is required.");
    const publicConnectionId = connection.publicId;
    const namespace = `definition-${randomUUID()}`;
    await f.db.$transaction((tx) =>
      ensureProjectSpendingBudget(tx, namespace, f.project.project.id),
    );
    let sequence = 0;
    const create = async (
      requestedById: string | null = f.project.writer.id,
      originalKeyId?: string,
    ) => {
      const manual = requestedById !== null || originalKeyId !== undefined;
      const keyword = await f.db.keyword.create({
        data: {
          projectId: f.project.project.id,
          publicId: makePublicId("kw"),
          text: `synthetic original ${++sequence}`,
          location: "Synthetic",
          locationId: f.observation.location.id,
        },
      });
      const run = await f.db.rankCheckRun.create({
        data: {
          publicId: makePublicId("rcr"),
          projectId: f.project.project.id,
          requestedById,
          ...(originalKeyId ? { credentialId: originalKeyId, credentialKind: "project_key" } : {}),
          trigger: manual ? "manual" : "scheduled",
          status: "running",
          selectionKind: manual ? "single" : "legacy_schedule",
          selectionSpec: { v: 1, kind: manual ? "single" : "legacy_schedule" },
          selectionHash: randomUUID(),
          requestedCount: 1,
        },
      });
      const check = await f.db.rankCheck.create({
        data: {
          publicId: makePublicId("check"),
          keywordId: keyword.id,
          runId: run.id,
          provider: "dataforseo",
          status: "running",
          attemptCount: 0,
          workflowRunId: invocation.runId,
        },
      });
      const definitionIntent = await f.db.$transaction((tx) =>
        captureDefinitionItemIntent(tx, f.project.project.id, keyword.id, 20),
      );
      const item = await f.db.rankCheckRunItem.create({
        data: {
          definitionIntent,
          runId: run.id,
          keywordId: keyword.id,
          rankCheckId: check.id,
          status: "running",
        },
      });
      const permit = await f.db.$transaction((tx) => claimDefinitionPaidCall(tx, check.id, false));
      if (!permit) throw new Error("Synthetic worker claim was refused.");
      const version = credentialVersion;
      const scope: WorkerDefinitionScope = {
        permit,
        projectId: keyword.projectId,
        keywordId: keyword.id,
        providerId: connection.provider,
        connectionId: connection.id,
        credentialSource: "own",
        credentialVersion: version,
        owner: workerDefinitionOwner(permit, connection.provider, connection.id, null),
      };
      const { host, withinNativeFence } = definitionWorkerHost(scope, {
        ...f.host,
        assertEntitlement: async () => undefined,
      });
      const binding = await f.db.$transaction((tx) =>
        captureDefinitionBeforeIo(
          tx,
          {
            projectId: keyword.projectId,
            keywordId: keyword.id,
            providerId: connection.provider,
            owner: scope.owner,
            requestedDepth: 20,
          },
          host,
        ),
      );
      const request: PaidAttemptInput = {
        reservation: {
          operationId: randomUUID(),
          fundingSource: "byok",
          costOwner: f.project.owner.id,
          provider: connection.provider,
          operation: "rank_check",
          source: "app",
          surface: "app",
          scope: {
            namespace,
            principal: f.project.owner.id,
            ...(originalKeyId
              ? { accessCredential: { kind: "project_key", id: originalKeyId } }
              : {}),
            group: keyword.projectId,
            connection: connection.id,
            providerCredentialVersion: version,
          },
          estimate: [
            { unit: "cents", value: 2n, scale: 0 },
            { unit: "requests", value: 1n, scale: 0 },
          ],
          reservationTtlMs: 60000,
        },
        context: {
          projectId: keyword.projectId,
          connectionId: connection.id,
          publicConnectionId,
          providerCredentialVersion: version,
          trigger: manual ? "manual" : "scheduled",
          correlationId: check.id,
          keywordId: keyword.id,
          rankCheckId: check.id,
          rankCheckRunId: run.id,
          rankCheckRunItemId: item.id,
        },
      };
      const grant = await f.db.$transaction(async (tx) => {
        const semantic = binding.request;
        const payload = {
          ...dataForSeoGoogleParams({
            depth: semantic.depth,
            location: locationForProvider(
              "dataforseo",
              serpRankLocation(semantic.location),
              semantic.location.kind === "city",
            ),
          }),
          keyword: semantic.keyword,
          device: semantic.device,
          search_param: "&nfpr=1",
          ...(semantic.stopOnMatch
            ? {
                find_targets_in: ["organic"],
                stop_crawl_on_match: [
                  { match_type: "with_subdomains", match_value: semantic.domain },
                ],
              }
            : {}),
        };
        await retainNativeDefinitionRequest(tx, binding, request.reservation.operationId, {
          method: "POST",
          url: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
          body: [payload],
        });
        const [reservation] = await reservePaidAttempts(tx, [request]);
        if (!reservation) throw new Error("Missing original native reservation.");
        return markPaidAttemptDispatch(tx, reservation, `owned:${check.id}`);
      });
      return {
        scope,
        binding,
        keyword,
        run,
        check,
        item,
        grant,
        hook: withinNativeFence(async (tx) => {
          await assertDefinitionAtDispatch(tx, binding, host);
        }),
      };
    };
    return { ...f, connection, namespace, create };
  } catch (error) {
    await f.close();
    throw error;
  }
}
