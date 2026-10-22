import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { makePublicId } from "@/lib/db/public-id-resources";
import { persistObservationRun } from "@/lib/observation/persist";
import type { SerpDepth } from "@/lib/serp/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frozenConfiguredScope } from "./canonical";
import type { DefinitionBinding } from "./model";
import { configureDefinitionPolicy } from "./policy-config";
import { definitionDatabaseFixture } from "./postgres.test-fixture";
import { assertDefinitionAtDispatch, captureDefinitionBeforeIo } from "./producer";
import { nativeRequestFixture } from "./worker-native.fixtures";
import { retainNativeDefinitionRequest } from "./worker-request-proof";

vi.mock("server-only", () => ({}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "versioned request SQL authority",
  () => {
    let f: Awaited<ReturnType<typeof definitionDatabaseFixture>>;
    beforeEach(async () => {
      f = await definitionDatabaseFixture();
    }, 120000);
    afterEach(async () => {
      await f?.close();
    });

    async function configure(
      native: "none" | "with_subdomains_on_match" = "none",
      providerId = "synthetic",
    ) {
      const epoch = await f.client.query(
        'SELECT "measurementPolicyEpoch"::text AS epoch FROM projects WHERE id=$1',
        [f.input.projectId],
      );
      await configureDefinitionPolicy(
        f.db,
        f.project.writerContext,
        {
          projectId: f.project.project.publicId,
          expectedPolicyEpoch: epoch.rows[0].epoch,
          config: {
            ...f.config,
            adapters: f.config.adapters.map((adapter) => ({
              ...adapter,
              providerId,
              nativeFindTargetsIn: native,
            })),
          },
        },
        f.host.recordMutation,
      );
    }

    async function preference(stopOnMatch: boolean | null) {
      if (stopOnMatch === null) {
        await f.db.projectDefaults.deleteMany({ where: { projectId: f.input.projectId } });
        return;
      }
      await f.db.projectDefaults.upsert({
        where: { projectId: f.input.projectId },
        create: {
          projectId: f.input.projectId,
          frequency: "manual",
          serpDepth: 20,
          serpStopOnMatch: stopOnMatch,
        },
        update: { serpStopOnMatch: stopOnMatch },
      });
    }

    async function capture(depth: SerpDepth = 20) {
      const input = {
        ...f.input,
        requestedDepth: depth,
        owner: { ...f.input.owner, executionKey: randomUUID() },
      };
      const binding = await f.db.$transaction((tx) => captureDefinitionBeforeIo(tx, input, f.host));
      return { input, binding };
    }

    async function insertRequest(binding: DefinitionBinding, request: Record<string, unknown>) {
      const id = randomUUID();
      const executionKey = randomUUID();
      await f.client.query(
        `INSERT INTO measurement_execution_bindings
        (id,"projectId","keywordId","rankCheckId","executionKey","queuedTaskId",
        "targetRevisionId","policyRevisionId",owner,request,source)
       SELECT $1,"projectId","keywordId","rankCheckId",$2,"queuedTaskId",
        "targetRevisionId","policyRevisionId",owner || jsonb_build_object('executionKey',$2::text),$3::jsonb,source
       FROM measurement_execution_bindings WHERE id=$4`,
        [id, executionKey, JSON.stringify(request), binding.id],
      );
      return { id, executionKey };
    }

    it("captures Top20 with full collection when persisted defaults still request stop-on-match", async () => {
      await configure("with_subdomains_on_match");
      await preference(true);
      const originalSql = await readFile(
        "prisma/migrations/20261012200600_measurement_definition_authority/migration.sql",
        "utf8",
      );
      const start = originalSql.indexOf("CREATE FUNCTION measurement_definition_binding_insert()");
      const end = originalSql.indexOf("CREATE TRIGGER measurement_target_insert", start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      await f.client.query(
        originalSql.slice(start, end).replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
      );
      await expect(capture()).rejects.toThrow("definition_request_mismatch");
      await f.client.query(
        await readFile(
          "prisma/migrations/20261021194000_measurement_request_compiler_v2/migration.sql",
          "utf8",
        ),
      );
      const { binding } = await capture();
      expect(binding.request).toMatchObject({
        compilerVersion: 2,
        depth: 20,
        stopOnMatch: false,
        findTargetsIn: null,
      });
      const defaults = await f.db.projectDefaults.findUniqueOrThrow({
        where: { projectId: f.input.projectId },
      });
      expect(defaults.serpStopOnMatch).toBe(true);
    });

    it("accepts exact legacy and v2 shapes across all depths, preferences and native target capabilities", async () => {
      for (const native of ["none", "with_subdomains_on_match"] as const) {
        await configure(native);
        for (const stored of [null, true, false]) {
          await preference(stored);
          for (const depth of [10, 20, 50, 100] as const) {
            const { binding } = await capture(depth);
            const effectiveStop = depth === 20 ? false : (stored ?? true);
            const expectedTarget =
              native === "with_subdomains_on_match" && effectiveStop ? "with_subdomains" : null;
            expect(binding.request).toMatchObject({
              compilerVersion: 2,
              depth,
              stopOnMatch: effectiveStop,
              findTargetsIn: expectedTarget,
            });
            const legacy: Record<string, unknown> = {
              ...binding.request,
              stopOnMatch: stored ?? true,
              findTargetsIn:
                native === "with_subdomains_on_match" && (stored ?? true)
                  ? "with_subdomains"
                  : null,
            };
            delete legacy.compilerVersion;
            await expect(insertRequest(binding, legacy)).resolves.toHaveProperty("id");
          }
        }
      }
    }, 60000);

    it("rejects noncanonical versions, extra fields and altered collection policies at the SQL boundary", async () => {
      await configure("with_subdomains_on_match");
      await preference(true);
      const { binding } = await capture();
      for (const compilerVersion of [undefined, 2]) {
        for (const depth of [undefined, null]) {
          const request: Record<string, unknown> = {
            ...binding.request,
            compilerVersion,
            depth,
          };
          if (compilerVersion === undefined) delete request.compilerVersion;
          if (depth === undefined) delete request.depth;
          await expect(insertRequest(binding, request)).rejects.toThrow(
            "definition_adapter_unavailable",
          );
        }
      }
      for (const compilerVersion of [1, 3, null, "2", true]) {
        await expect(
          insertRequest(binding, { ...binding.request, compilerVersion }),
        ).rejects.toThrow("definition_request_compiler_unavailable");
      }
      for (const patch of [
        { extra: true },
        { stopOnMatch: true },
        { findTargetsIn: "with_subdomains" },
        { keyword: "another keyword" },
        { domain: "another.example.test" },
      ]) {
        await expect(insertRequest(binding, { ...binding.request, ...patch })).rejects.toThrow(
          "definition_request_mismatch",
        );
      }
      const falseLegacy: Record<string, unknown> = { ...binding.request };
      delete falseLegacy.compilerVersion;
      await expect(insertRequest(binding, falseLegacy)).rejects.toThrow(
        "definition_request_mismatch",
      );
      await expect(
        f.client.query("UPDATE measurement_execution_bindings SET request=request WHERE id=$1", [
          binding.id,
        ]),
      ).rejects.toThrow("definition_append_only");
    });

    it("resumes an original legacy binding and retains its policy in a newly collected observation", async () => {
      await configure("with_subdomains_on_match", "dataforseo");
      f.input = { ...f.input, providerId: "dataforseo" };
      await preference(true);
      const check = await f.db.rankCheck.create({
        data: {
          keywordId: f.input.keywordId,
          provider: "dataforseo",
          publicId: makePublicId("check"),
          requestedDepth: 20,
          status: "running",
        },
      });
      f.input = { ...f.input, owner: { ...f.input.owner, rankCheckId: check.id } };
      const { binding } = await capture();
      const legacy: Record<string, unknown> = {
        ...binding.request,
        stopOnMatch: true,
        findTargetsIn: "with_subdomains",
      };
      delete legacy.compilerVersion;
      const inserted = await insertRequest(binding, legacy);
      const original = await f.db.$transaction((tx) =>
        captureDefinitionBeforeIo(
          tx,
          {
            ...f.input,
            requestedDepth: 20,
            owner: { ...f.input.owner, executionKey: inserted.executionKey },
          },
          f.host,
        ),
      );
      expect(original.id).toBe(inserted.id);
      expect(original.request).toEqual(legacy);
      await f.db.$transaction((tx) => assertDefinitionAtDispatch(tx, original, f.host));
      const operationId = randomUUID();
      const nativeRequest = nativeRequestFixture(original);
      for (let repeat = 0; repeat < 2; repeat++)
        await f.db.$transaction((tx) =>
          retainNativeDefinitionRequest(tx, original, operationId, nativeRequest),
        );
      expect(
        (await f.client.query("SELECT count(*)::int AS n FROM measurement_native_request_proofs"))
          .rows[0].n,
      ).toBe(1);
      await expect(
        f.db.$transaction((tx) =>
          retainNativeDefinitionRequest(tx, original, operationId, nativeRequestFixture(binding)),
        ),
      ).rejects.toMatchObject({ code: "measurement_definition_unavailable" });
      await f.db.$transaction((tx) =>
        persistObservationRun(tx, {
          projectId: f.input.projectId,
          rankCheckId: check.id,
          definitionBindingId: original.id,
          input: {
            surface: "web_serp",
            engine: "google",
            provider: "dataforseo",
            completeness: "truncated_by_stop_on_match",
            configuredScope: frozenConfiguredScope(original.source.target),
            executedAt: new Date(),
            items: [],
            requestPolicy: {
              depth: 20,
              stopOnMatch: true,
              findTargetsIn: "with_subdomains",
              forcedAiOverview: false,
              evidence: {
                version: 1,
                adapterVersion: original.request.adapterVersion,
                observedAt: null,
                requestedAt: null,
                completeThrough: { organic_result: null },
              },
            },
          },
        }),
      );
      const row = await f.db.observationRun.findUniqueOrThrow({ where: { rankCheckId: check.id } });
      expect(row.definitionBindingId).toBe(original.id);
      expect(row.requestPolicy).toMatchObject({ stopOnMatch: true });
      expect(row.completeness).toBe("truncated_by_stop_on_match");
    });
  },
);
