import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { persistObservationRun } from "@/lib/observation/persist";
import type { WebObservationRunInput } from "@/lib/observation/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { frozenConfiguredScope } from "./canonical";
import type { DefinitionBinding } from "./model";
import { configureDefinitionPolicy } from "./policy-config";
import { definitionDatabaseFixture } from "./postgres.test-fixture";
import { captureDefinitionBeforeIo } from "./producer";

vi.mock("server-only", () => ({}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)("original observation binding", () => {
  let f: Awaited<ReturnType<typeof definitionDatabaseFixture>>;
  beforeEach(async () => {
    f = await definitionDatabaseFixture();
  }, 120000);
  afterEach(async () => {
    await f?.close();
  });
  async function prepared() {
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
        config: f.config,
      },
      f.host.recordMutation,
    );
    const check = await f.db.rankCheck.create({
      data: {
        keywordId: f.input.keywordId,
        provider: "synthetic",
        publicId: makePublicId("check"),
        requestedDepth: 100,
        status: "running",
      },
    });
    const input = {
      ...f.input,
      owner: { ...f.input.owner, rankCheckId: check.id, executionKey: randomUUID() },
    };
    return {
      check,
      input,
      binding: await f.db.$transaction((tx) => captureDefinitionBeforeIo(tx, input, f.host)),
    };
  }
  function observation(binding: DefinitionBinding): WebObservationRunInput {
    return {
      surface: "web_serp",
      engine: "google",
      provider: binding.request.providerId,
      completeness: "unknown",
      configuredScope: frozenConfiguredScope(binding.source.target),
      executedAt: new Date(),
      items: [],
      requestPolicy: {
        depth: binding.request.depth,
        stopOnMatch: binding.request.stopOnMatch,
        findTargetsIn: binding.request.findTargetsIn,
        forcedAiOverview: false,
        evidence: {
          version: 1,
          adapterVersion: binding.request.adapterVersion,
          observedAt: null,
          requestedAt: null,
          completeThrough: { organic_result: null },
        },
      },
    };
  }
  it("rejects adding canonical revisions to an existing unbound legacy row", async () => {
    const { binding } = await prepared();
    await expect(
      f.client.query(
        `UPDATE observation_runs SET "requestPolicy"=jsonb_set("requestPolicy",'{evidence}',coalesce("requestPolicy"->'evidence','{}'::jsonb)||jsonb_build_object('targetRevision',$2::text,'policyRevision',$3::text)) WHERE id=$1`,
        [f.observation.run.id, binding.targetRevision, binding.policyRevision],
      ),
    ).rejects.toThrow("definition_unbound_revisions");
    await f.db.observationRun.update({
      where: { id: f.observation.run.id },
      data: { completeness: "unknown" },
    });
    expect(
      (await f.db.observationRun.findUniqueOrThrow({ where: { id: f.observation.run.id } }))
        .definitionBindingId,
    ).toBeNull();
  });
  it("persists the selected fallback binding when a check has multiple original attempts", async () => {
    const { check, input, binding } = await prepared();
    const winner = await f.db.$transaction((tx) =>
      captureDefinitionBeforeIo(
        tx,
        { ...input, owner: { ...input.owner, executionKey: randomUUID() } },
        f.host,
      ),
    );
    expect(winner.id).not.toBe(binding.id);
    await f.db.$transaction((tx) =>
      persistObservationRun(tx, {
        projectId: f.input.projectId,
        rankCheckId: check.id,
        definitionBindingId: winner.id,
        input: observation(winner),
      }),
    );
    const row = await f.db.observationRun.findUniqueOrThrow({ where: { rankCheckId: check.id } });
    expect(row.definitionBindingId).toBe(winner.id);
    expect(row.completeness).toBe("unknown");
  });
  it("rejects a different check owner even inside the same project", async () => {
    const { binding } = await prepared();
    const other = await f.db.rankCheck.create({
      data: {
        keywordId: f.input.keywordId,
        provider: "synthetic",
        publicId: makePublicId("check"),
      },
    });
    await expect(
      f.db.$transaction((tx) =>
        persistObservationRun(tx, {
          projectId: f.input.projectId,
          rankCheckId: other.id,
          definitionBindingId: binding.id,
          input: observation(binding),
        }),
      ),
    ).rejects.toThrow("binding is unavailable");
    expect(await f.db.observationRun.count({ where: { rankCheckId: other.id } })).toBe(0);
  });
  it("enforces request policy on direct database writes as well as the ordinary persistence path", async () => {
    const { check, binding } = await prepared();
    const input = observation(binding);
    await f.db.$transaction((tx) =>
      persistObservationRun(tx, {
        projectId: f.input.projectId,
        rankCheckId: check.id,
        definitionBindingId: binding.id,
        input,
      }),
    );
    await expect(
      f.client.query(
        `UPDATE observation_runs SET "requestPolicy"=jsonb_set("requestPolicy",'{stopOnMatch}','false') WHERE "rankCheckId"=$1`,
        [check.id],
      ),
    ).rejects.toThrow("definition_observation_binding_mismatch");
    await expect(
      f.client.query(
        `UPDATE observation_runs SET "requestPolicy"=jsonb_set("requestPolicy",'{evidence,adapterVersion}','"wrong"') WHERE "rankCheckId"=$1`,
        [check.id],
      ),
    ).rejects.toThrow("definition_observation_binding_mismatch");
  });
});
