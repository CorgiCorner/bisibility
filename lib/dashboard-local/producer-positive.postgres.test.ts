import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/auth/authorize";
import { assignBusinessLocationFor } from "@/lib/business-location-store/assignment-write";
import { readBusinessLocationFor } from "@/lib/business-location-store/location-read";
import { createBusinessLocationFor } from "@/lib/business-location-store/location-write";
import { rematchBusinessLocationFor } from "@/lib/business-location-store/match-write";
import { identityCommand } from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { frozenConfiguredScope } from "@/lib/measurement-definitions/canonical";
import type { DefinitionBinding } from "@/lib/measurement-definitions/model";
import { configureDefinitionPolicy } from "@/lib/measurement-definitions/policy-config";
import { definitionDatabaseFixture } from "@/lib/measurement-definitions/postgres.test-fixture";
import {
  assertDefinitionAtDispatch,
  captureDefinitionBeforeIo,
} from "@/lib/measurement-definitions/producer";
import { persistObservationRun } from "@/lib/observation/persist";
import type { WebObservationRunInput } from "@/lib/observation/types";
import { dataForSeoProvider } from "@/lib/providers/serp/dataforseo";
import { DATAFORSEO_OBSERVATION_ADAPTER_VERSION } from "@/lib/providers/serp/observation-adapter-versions";
import { dataForSeoObservationRun } from "@/lib/providers/serp/observation-extract-dataforseo";
import { testUsageObserver } from "@/lib/providers/usage-test-observer";
import { getOverview } from "@/lib/queries/overview";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "@/lib/rank-check/normalization-version";
import { serpRankLocation } from "@/lib/serp/location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dashboardLocalSelectionSchema } from "./selection";

const session = vi.hoisted(() => ({
  db: null as PrismaClient | null,
  actor: null as Actor | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({} as PrismaClient, {
    get(_target, key) {
      if (!session.db) throw new Error("Owned fixture database is not installed");
      const value = Reflect.get(session.db, key, session.db);
      return typeof value === "function" ? value.bind(session.db) : value;
    },
  }),
}));
vi.mock("@/lib/queries/_auth", () => ({
  getQueryActor: async () => {
    if (!session.actor) throw new Error("Fixture session is missing");
    return session.actor;
  },
  requireReadableProject: async (publicId: string) => {
    if (!session.db || !session.actor) throw new Error("Fixture session is missing");
    return {
      actor: session.actor,
      project: await session.db.project.findUniqueOrThrow({ where: { publicId } }),
    };
  },
}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));

type Case = { kind: "found"; slot: 1 | 3 } | { kind: "other" | "absent" | "unknown" | "failed" };
const cases: readonly Case[] = [
  { kind: "found", slot: 1 },
  { kind: "found", slot: 1 },
  { kind: "found", slot: 3 },
  { kind: "found", slot: 3 },
  { kind: "other" },
  { kind: "other" },
  { kind: "absent" },
  { kind: "absent" },
  { kind: "failed" },
  { kind: "unknown" },
];

/** Explicit test adapter contract: complete response is an independent input, never inferred from empty items.
 * It is deliberately synthetic; this is not a claim that a production provider exposes this proof. */
function syntheticObservation(
  binding: DefinitionBinding,
  value: Case,
  index: number,
): WebObservationRunInput {
  const at = new Date();
  const complete = value.kind !== "unknown";
  const hasPack = value.kind === "found" || value.kind === "other";
  return {
    provider: "synthetic",
    engine: "google",
    surface: "web_serp",
    completeness: complete ? "complete" : "unknown",
    configuredScope: frozenConfiguredScope(binding.source.target),
    effectiveScope: frozenConfiguredScope(binding.source.target),
    executedAt: at,
    requestPolicy: {
      depth: binding.request.depth,
      stopOnMatch: binding.request.stopOnMatch,
      findTargetsIn: binding.request.findTargetsIn,
      forcedAiOverview: false,
      evidence: {
        version: 1,
        adapterVersion: binding.request.adapterVersion,
        observedAt: at.toISOString(),
        requestedAt: binding.capturedAt.toISOString(),
        completeThrough: { local_pack: complete ? 3 : null, organic_result: null },
      },
    },
    items: hasPack
      ? [1, 2, 3].map((slot) => ({
          resultKind: "local_pack",
          rankScale: "pack_slot",
          promotion: "organic",
          sourcePage: 1,
          sourceBlockId: "synthetic-pack-1",
          sourceOrdinal: slot,
          blockPosition: 1,
          positionInBlock: slot,
          observedAt: at,
          businessName: "Synthetic business",
          domain: "example.com",
          cid:
            value.kind === "found" && value.slot === slot
              ? "123"
              : String(10000 + index * 10 + slot),
          rawFragment: { fixtureOnly: true, completePack: true, slot },
        }))
      : [],
  };
}

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "bound Local producer and actual overview",
  () => {
    let fixture: Awaited<ReturnType<typeof definitionDatabaseFixture>> | null = null;
    afterEach(async () => {
      session.db = null;
      session.actor = null;
      await fixture?.close();
      fixture = null;
      vi.restoreAllMocks();
    });

    it("uses actual capture, immutable persistence and real saved matching for the complete ten-target oracle", async () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Synthetic observation must not make provider requests"));
      fixture = await definitionDatabaseFixture();
      const f = fixture;
      session.db = f.db;
      session.actor = f.project.ownerContext.actor;
      const project = f.project.project;
      const legacyBefore = await f.db.observationRun.findUniqueOrThrow({
        where: { id: f.observation.run.id },
      });
      const created = await createBusinessLocationFor(
        identityCommand(project.publicId, "123"),
        f.project.writerContext,
        f.db,
      );
      if (created.receipt.kind !== "identity") throw new Error("Expected identity receipt");
      const { location } = await readBusinessLocationFor(
        project.publicId,
        created.receipt.publicId,
        f.project.writerContext,
        f.db,
      );
      const market = await f.db.projectMarket.create({
        data: {
          projectId: project.id,
          publicId: makePublicId("pmkt"),
          locationId: f.observation.location.id,
          status: "active",
          name: "Synthetic Local cohort",
        },
      });
      const target = {
        locationId: location.publicId,
        identityRevisionId: location.currentRevision.id,
      };
      await assignBusinessLocationFor(
        {
          projectId: project.publicId,
          scope: { kind: "market", id: market.publicId },
          target,
          expectedRevision: 0,
          reason: "Synthetic Local cohort",
          idempotencyKey: randomUUID(),
        },
        f.project.writerContext,
        f.db,
      );
      // Exclude the pre-existing unrelated legacy target through an explicit assignment, not deletion or history repair.
      await assignBusinessLocationFor(
        {
          projectId: project.publicId,
          scope: { kind: "keyword", id: f.observation.keyword.publicId },
          target: null,
          expectedRevision: 0,
          reason: "Unrelated fixture target",
          idempotencyKey: randomUUID(),
        },
        f.project.writerContext,
        f.db,
      );
      await f.db.projectDefaults.create({
        data: { projectId: project.id, frequency: "manual", timezone: "UTC", serpDepth: 20 },
      });
      const config = structuredClone(f.config);
      config.freshness = {
        configurationRevision: "synthetic-local-freshness-v1",
        manualTtlMs: 3600000,
        cadenceGraceMs: null,
      };
      const [before] = await f.client
        .query<{ epoch: string }>(
          'SELECT "measurementPolicyEpoch"::text AS epoch FROM projects WHERE id=$1',
          [project.id],
        )
        .then((result) => result.rows);
      if (!before) throw new Error("Missing actual project policy epoch");
      await configureDefinitionPolicy(
        f.db,
        f.project.writerContext,
        { projectId: project.publicId, expectedPolicyEpoch: before.epoch, config },
        f.host.recordMutation,
      );
      const ids: string[] = [];
      const bindings: string[] = [];
      for (const [index, value] of cases.entries()) {
        const keyword = await f.db.keyword.create({
          data: {
            projectId: project.id,
            publicId: makePublicId("kw"),
            text: `Synthetic Local case ${index}`,
            location: "Synthetic",
            locationId: f.observation.location.id,
          },
        });
        ids.push(keyword.publicId);
        const check = await f.db.rankCheck.create({
          data: {
            keywordId: keyword.id,
            publicId: makePublicId("check"),
            provider: "synthetic",
            requestedDepth: 20,
            status: "running",
          },
        });
        const binding = await f.db.$transaction((tx) =>
          captureDefinitionBeforeIo(
            tx,
            {
              projectId: project.id,
              keywordId: keyword.id,
              providerId: "synthetic",
              requestedDepth: 20,
              owner: { rankCheckId: check.id, executionKey: randomUUID(), queuedTaskId: null },
            },
            f.host,
          ),
        );
        bindings.push(binding.id);
        await f.db.$transaction((tx) => assertDefinitionAtDispatch(tx, binding, f.host));
        if (value.kind === "failed") {
          await f.db.rankCheck.update({ where: { id: check.id }, data: { status: "failed" } });
          continue;
        }
        await f.db.$transaction(async (tx) => {
          await persistObservationRun(tx, {
            projectId: project.id,
            rankCheckId: check.id,
            definitionBindingId: binding.id,
            input: syntheticObservation(binding, value, index),
          });
          await tx.rankCheck.update({
            where: { id: check.id },
            data: { status: "completed", normalizationVersion: "synthetic-local-normalization-v1" },
          });
        });
        const run = await f.db.observationRun.findUniqueOrThrow({
          where: { rankCheckId: check.id },
          include: { items: true },
        });
        expect(run.definitionBindingId).toBe(binding.id);
        expect(run.requestPolicy).toMatchObject({
          evidence: {
            targetRevision: binding.targetRevision,
            policyRevision: binding.policyRevision,
          },
        });
        if (run.items.length)
          await rematchBusinessLocationFor(
            {
              projectId: project.publicId,
              ...target,
              observationRunId: run.id,
              expectedDecisions: run.items.map((item) => ({
                itemId: item.id,
                expectedRevision: 0,
              })),
              idempotencyKey: randomUUID(),
            },
            f.project.writerContext,
            f.db,
          );
      }
      const storedDecisions = await f.db.businessMatchDecision.findMany({
        where: { projectId: project.id },
      });
      expect(storedDecisions.filter((decision) => decision.status === "confirmed")).toHaveLength(4);
      const rejected = storedDecisions.filter((decision) => decision.status === "rejected");
      expect(rejected).toHaveLength(14);
      for (const decision of rejected)
        expect(decision.evidence).toMatchObject({ organicEligible: false });
      const beforeRead = await Promise.all([
        f.db.rankCheck.count(),
        f.db.businessMatchDecision.count(),
        f.db.checkSchedule.count(),
        f.client
          .query<{ count: number }>(
            "SELECT count(*)::int AS count FROM measurement_execution_bindings",
          )
          .then((result) => result.rows[0].count),
      ]);
      const now = new Date();
      const overview = await getOverview(project.publicId, {
        now,
        localSelection: dashboardLocalSelectionSchema.parse({
          scope: { kind: "market", id: market.publicId },
          ...target,
          assignmentRevision: 1,
        }),
      });
      const report = overview.localReport;
      if (!report) throw new Error("Actual Local report was not returned");
      expect(report.expected).toBe(10);
      expect(report.rows.map((row) => row.keywordId).sort()).toEqual([...ids].sort());
      expect(overview.trackedKeywordCount).toBe(10);
      expect(overview.qualityReport.counts.expected).toBe(10);
      expect(report.presence.observedCoverage).toBe(0.8);
      expect(report.presence.value).toBe(75);
      expect(report.targetTop3.value).toBe(50);
      expect(report.conditionalTop3.value).toBeCloseTo(200 / 3);
      expect(report.averageFoundSlot).toBe(2);
      expect(report.averageFoundCount).toBe(4);
      expect(report.matchCoverage).toBe(1);
      expect(report.targetTop3.counts.failed).toBe(1);
      expect(report.targetTop3.dataCoverage).toBe(0.8);
      expect(report.targetTop3.delta).toBeNull();
      expect(report.asOf).toBe(now.toISOString());
      expect(beforeRead).toEqual(
        await Promise.all([
          f.db.rankCheck.count(),
          f.db.businessMatchDecision.count(),
          f.db.checkSchedule.count(),
          f.client
            .query<{ count: number }>(
              "SELECT count(*)::int AS count FROM measurement_execution_bindings",
            )
            .then((result) => result.rows[0].count),
        ]),
      );
      expect(
        await f.db.observationRun.findUniqueOrThrow({ where: { id: f.observation.run.id } }),
      ).toEqual(legacyBefore);
      expect(fetch).not.toHaveBeenCalled();
      expect(bindings).toHaveLength(10);
    }, 120000);

    it("persists and matches a real DFS web-local parser result through the current Local report without network", async () => {
      fixture = await definitionDatabaseFixture();
      const f = fixture;
      session.db = f.db;
      session.actor = f.project.ownerContext.actor;
      const project = f.project.project;
      const created = await createBusinessLocationFor(
        identityCommand(project.publicId, "123"),
        f.project.writerContext,
        f.db,
      );
      if (created.receipt.kind !== "identity") throw new Error("Expected identity receipt");
      const { location } = await readBusinessLocationFor(
        project.publicId,
        created.receipt.publicId,
        f.project.writerContext,
        f.db,
      );
      const target = {
        locationId: location.publicId,
        identityRevisionId: location.currentRevision.id,
      };
      const keyword = await f.db.keyword.create({
        data: {
          projectId: project.id,
          publicId: makePublicId("kw"),
          text: "Offline provider-contract local",
          location: "Synthetic",
          locationId: f.observation.location.id,
        },
      });
      await assignBusinessLocationFor(
        {
          projectId: project.publicId,
          scope: { kind: "keyword", id: keyword.publicId },
          target,
          expectedRevision: 0,
          reason: "Offline real-parser fixture",
          idempotencyKey: randomUUID(),
        },
        f.project.writerContext,
        f.db,
      );
      await f.db.projectDefaults.create({
        data: { projectId: project.id, frequency: "manual", timezone: "UTC", serpDepth: 20 },
      });
      const config = structuredClone(f.config);
      config.adapters = [
        {
          providerId: "dataforseo",
          capabilityVersion: "web-serp-v1",
          adapterVersion: DATAFORSEO_OBSERVATION_ADAPTER_VERSION,
          nativeFindTargetsIn: "with_subdomains_on_match",
        },
      ];
      config.freshness.manualTtlMs = 3600000;
      const [epoch] = await f.client
        .query<{ epoch: string }>(
          'SELECT "measurementPolicyEpoch"::text AS epoch FROM projects WHERE id=$1',
          [project.id],
        )
        .then((result) => result.rows);
      if (!epoch) throw new Error("Missing real policy epoch");
      await configureDefinitionPolicy(
        f.db,
        f.project.writerContext,
        { projectId: project.publicId, expectedPolicyEpoch: epoch.epoch, config },
        f.host.recordMutation,
      );
      const check = await f.db.rankCheck.create({
        data: {
          keywordId: keyword.id,
          publicId: makePublicId("check"),
          provider: "dataforseo",
          requestedDepth: 20,
          status: "running",
        },
      });
      const binding = await f.db.$transaction((tx) =>
        captureDefinitionBeforeIo(
          tx,
          {
            projectId: project.id,
            keywordId: keyword.id,
            providerId: "dataforseo",
            requestedDepth: 20,
            owner: { rankCheckId: check.id, executionKey: randomUUID(), queuedTaskId: null },
          },
          f.host,
        ),
      );
      await f.db.$transaction((tx) => assertDefinitionAtDispatch(tx, binding, f.host));
      const observedAt = new Date();
      const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            status_code: 20000,
            cost: 0,
            tasks: [
              {
                status_code: 20000,
                cost: 0,
                result: [
                  {
                    datetime: observedAt.toISOString(),
                    language_code: binding.request.location.hl,
                    items: [
                      {
                        type: "organic",
                        rank_group: 1,
                        url: `https://${binding.request.domain.replace(/^https?:\/\//, "")}/`,
                      },
                      {
                        type: "local_pack",
                        page: 1,
                        rank_group: 2,
                        rank_absolute: 3,
                        cid: "123",
                        is_paid: false,
                        title: "Offline branch",
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
      const result = await dataForSeoProvider.fetchRank({
        keyword: binding.request.keyword,
        device: binding.request.device,
        domain: binding.request.domain,
        depth: binding.request.depth,
        stopOnMatch: binding.request.stopOnMatch,
        location: serpRankLocation(binding.request.location),
        credentials: { login: "offline", password: "offline", usageObserver: testUsageObserver },
      });
      const observation = result.observation;
      if (observation?.surface !== "web_serp")
        throw new Error("Expected actual web parser observation");
      expect(observation.requestPolicy).toMatchObject({
        depth: binding.request.depth,
        stopOnMatch: binding.request.stopOnMatch,
        findTargetsIn: binding.request.findTargetsIn,
        forcedAiOverview: binding.request.forcedAiOverview,
      });
      expect(observation.requestPolicy.evidence?.completeThrough.local_pack).toBeNull();
      await f.db.$transaction(async (tx) => {
        await persistObservationRun(tx, {
          projectId: project.id,
          rankCheckId: check.id,
          definitionBindingId: binding.id,
          input: observation,
        });
        await tx.rankCheck.update({
          where: { id: check.id },
          data: {
            status: "completed",
            position: result.position,
            normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
          },
        });
      });
      const run = await f.db.observationRun.findUniqueOrThrow({
        where: { rankCheckId: check.id },
        include: { items: true },
      });
      await rematchBusinessLocationFor(
        {
          projectId: project.publicId,
          ...target,
          observationRunId: run.id,
          expectedDecisions: run.items.map((item) => ({ itemId: item.id, expectedRevision: 0 })),
          idempotencyKey: randomUUID(),
        },
        f.project.writerContext,
        f.db,
      );
      const report = (
        await getOverview(project.publicId, {
          now: new Date(),
          localSelection: dashboardLocalSelectionSchema.parse({
            scope: { kind: "keyword", id: keyword.publicId },
            ...target,
            assignmentRevision: 1,
          }),
        })
      ).localReport;
      expect(report?.expected).toBe(1);
      expect(report?.targetTop3.value).toBe(100);
      expect(report?.averageFoundSlot).toBe(2);
      expect(report?.presence.value).toBe(100);
      expect(fetch).toHaveBeenCalledTimes(1);
    }, 120000);

    it("does not manufacture production-adapter completeness or organic slot classification", () => {
      const observation = dataForSeoObservationRun({
        items: [
          {
            type: "local_pack",
            rank_absolute: 1,
            items: [{ title: "Example", cid: "123", rank_group: 1 }],
          },
        ],
        providerResults: [{ datetime: "2026-10-12T12:00:00Z" }],
        configuredScope: { location: "Synthetic", language: "en", device: "desktop" },
        effectiveScope: { location: "Synthetic", language: "en", device: "desktop" },
        requestPolicy: { depth: 20, stopOnMatch: false, forcedAiOverview: false },
        completeness: "complete",
        executedAt: new Date("2026-10-12T12:00:00Z"),
      });
      expect(observation.requestPolicy.evidence?.completeThrough.local_pack).toBeNull();
      expect(observation.items[0].rankScale).toBe("pack_slot");
      expect(observation.items[0].promotion).toBe("unknown");
    });
  },
);
