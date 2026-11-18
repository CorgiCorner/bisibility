import "./model-playground-real.test-helpers";
import * as launch from "@/lib/model-playground/launch";
import { nativeComposer } from "@/lib/model-playground/server";
import { ModelTransportError } from "@/lib/providers/model/errors";
import { afterEach, expect, it, vi } from "vitest";
import { projectionAnswer, realServiceHarness, seams } from "./model-playground-real.test-helpers";
import { getModelPlaygroundService } from "./model-playground-service";

const h = realServiceHarness();
const enabled = nativeComposer.enabled;
afterEach(() => {
  nativeComposer.enabled = enabled;
});

it("routes catalog, preview, create and read through the native server binding", async () => {
  const catalog = await h.request("GET", h.catalogPath());
  expect(catalog.status).toBe(200);
  const metadata = (await catalog.json()).data;
  expect(metadata.models).toHaveLength(1);
  expect(metadata).not.toHaveProperty("account_digest");
  expect(await h.count()).toBe(0);
  const quoteId = await h.preview();
  expect(await h.count()).toBe(0);
  const created = await h.request("POST", "runs", h.body(quoteId), "initial");
  expect(created.status).toBe(200);
  const admission = (await created.json()).data;
  expect(admission).toMatchObject({ kind: "admitted", quote_id: quoteId, replayed: false });
  expect(admission.attempts).toHaveLength(1);
  expect(admission.attempts[0]).not.toHaveProperty("binding");
  const read = await h.request("GET", `runs/${admission.run_id}`);
  expect(read.status).toBe(200);
  expect((await read.json()).data).toMatchObject({
    run_id: admission.run_id,
    project_id: h.projectId,
    prompt: h.input.prompt,
    columns: [
      {
        state: "completed",
        result_issue: null,
        result: { answer: "An answer with two citations." },
      },
    ],
  });
  expect(await h.count()).toBe(1);
  expect(h.calls).toHaveLength(1);
  expect(
    (
      await h.sql.query<{ source: string; surface: string }>(
        "SELECT input->>'source' AS source,input->>'surface' AS surface FROM metering_operation",
      )
    ).rows,
  ).toEqual([{ source: "api", surface: "programmatic" }]);
});

// States: quoted -> admitted -> saved replay; uncertain transport -> saved replay.
// HTTP keys bind bodies; new keys still use the quote's durable admission, never new attempts.
it.each([
  {
    transition: "same key/body",
    key: "initial",
    uncertain: false,
    changed: false,
    status: 200,
    replay: "http",
  },
  {
    transition: "new key/same quote",
    key: "recovery",
    uncertain: false,
    changed: false,
    status: 200,
    replay: "domain",
  },
  {
    transition: "same key/changed body",
    key: "initial",
    uncertain: false,
    changed: true,
    status: 422,
    replay: "refused",
  },
  {
    transition: "timeout after commit",
    key: "recovery",
    uncertain: true,
    changed: false,
    status: 200,
    replay: "domain",
  },
])("models $transition without a second admission", async (step) => {
  const quoteId = await h.preview();
  let savedRun: string | undefined;
  if (step.uncertain) {
    const realLaunch = launch.launchModelPlayground;
    vi.spyOn(launch, "launchModelPlayground").mockImplementationOnce(async (...args) => {
      const saved = await realLaunch(...args);
      if (saved.kind === "admitted") savedRun = saved.result.runId;
      return { kind: "uncertain", message: "Synthetic lost response after commit" };
    });
  }
  const first = await h.request("POST", "runs", h.body(quoteId), "initial");
  expect(first.status).toBe(step.uncertain ? 500 : 200);
  if (!step.uncertain) savedRun = (await first.json()).data.run_id;
  expect(await h.count()).toBe(1);
  const next = await h.request(
    "POST",
    "runs",
    h.body(step.changed ? crypto.randomUUID() : quoteId),
    step.key,
  );
  expect(next.status).toBe(step.status);
  if (step.replay === "http") expect(next.headers.get("Idempotency-Replayed")).toBe("true");
  if (step.replay !== "refused")
    expect((await next.json()).data).toMatchObject({
      run_id: savedRun,
      replayed: step.replay === "domain",
    });
  expect(await h.count()).toBe(1);
  expect(h.calls).toHaveLength(1);
});

it("refuses a key without update scope before entering the service", async () => {
  const create = vi.spyOn(getModelPlaygroundService(), "create");
  const response = await h.request("POST", "runs", h.body(crypto.randomUUID()), "denied", {
    ...h.auth,
    apiKey: { ...h.auth.apiKey, scopes: ["read"] },
  });
  expect(response.status).toBe(403);
  expect(create).not.toHaveBeenCalled();
  expect(await h.count()).toBe(0);
});

it("rechecks live read-only mode before quote reads or admission", async () => {
  const quoteId = await h.preview();
  await h.sql.query("UPDATE projects SET \"writeMode\"='migration_hold'");
  const before = seams.transaction.mock.calls.length;
  const response = await h.request("POST", "runs", h.body(quoteId), "held");
  expect(response.status).toBe(403);
  expect(
    await getModelPlaygroundService().create(
      {
        actor: { id: h.project.ownerId, memberships: [{ projectId: h.project.id, role: "admin" }] },
        projectId: h.project.id,
        projectPublicId: h.projectId,
        entrySource: "api",
        credential: { id: "fixture-key", kind: "project_key" },
      },
      { version: 1, quoteId, consent: "non_guaranteed_estimate_v1" },
      "held-direct",
    ),
  ).toEqual({ kind: "forbidden" });
  expect(seams.transaction.mock.calls.length).toBe(before);
  expect(await h.count()).toBe(0);
});

it("rechecks live membership and owner identity before reading a connection", async () => {
  const service = getModelPlaygroundService();
  const scope = {
    actor: { id: "actor", memberships: [{ projectId: h.project.id, role: "member" as const }] },
    projectId: h.project.id,
    projectPublicId: h.projectId,
    entrySource: "api" as const,
    credential: { id: "fixture-pat", kind: "personal_token" as const },
  };
  const input = {
    providerId: h.input.columns[0].providerId,
    connectionId: h.input.columns[0].connectionId,
  };
  expect(await service.checkConnection(scope, input)).toEqual({ kind: "ready" });
  expect(seams.decrypt).not.toHaveBeenCalled();
  await h.sql.query("DELETE FROM memberships");
  expect(await service.checkConnection(scope, input)).toEqual({ kind: "forbidden" });
  await h.sql.query("UPDATE projects SET \"ownerId\"='actor'");
  const keyScope = {
    ...scope,
    actor: { ...scope.actor, id: h.context.principal },
    credential: { id: "fixture-key", kind: "project_key" as const },
  };
  expect(await service.checkConnection(keyScope, input)).toEqual({ kind: "forbidden" });
  expect(seams.decrypt).not.toHaveBeenCalled();
});

it("returns not_found for another project's run without leaking retained text", async () => {
  const quoteId = await h.preview();
  const created = (await (await h.request("POST", "runs", h.body(quoteId), "initial")).json()).data;
  const original = seams.project.getMockImplementation();
  if (!original) throw new Error("Missing project fixture");
  // A second authorized project shares the same SQL fixture, never the first run's scope.
  seams.project.mockImplementation(async () => ({ ...h.project, id: "other-project" }));
  try {
    const response = await h.request("GET", `runs/${created.run_id}`, undefined, undefined, {
      ...h.auth,
      project: { ...h.project, id: "other-project" },
      apiKey: { ...h.auth.apiKey, projectId: "other-project" },
    });
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain(h.input.prompt);
    expect(h.calls).toHaveLength(1);
  } finally {
    seams.project.mockImplementation(original);
  }
});

it("keeps another paid answer when one stored column cannot cross the public projection", async () => {
  h.input.columns.push({ ...structuredClone(h.input.columns[0]), columnId: crypto.randomUUID() });
  const quoteId = await h.preview();
  // Native-unit receipts are domain-valid but cannot cross the REST currency-only receipt schema.
  h.answer((answer) => projectionAnswer(answer, h.input.columns[0].columnId, quoteId));
  const created = (await (await h.request("POST", "runs", h.body(quoteId), "initial")).json()).data;
  const response = await h.request("GET", `runs/${created.run_id}`);
  expect(response.status).toBe(200);
  const columns = (await response.json()).data.columns;
  expect(columns[0]).toMatchObject({ result: null, result_issue: "unprojectable" });
  expect(columns[1]).toMatchObject({
    result_issue: null,
    result: { answer: "An answer with two citations." },
  });
  expect(columns[1].result.provider_cost).toMatchObject({ amount: null, certainty: "unknown" });
  expect(columns[1].result.payment_receipt.provider_cost).toMatchObject({
    value: "0.12",
    certainty: "measured",
  });
  expect(columns[1].result.cost_evidence.local_estimate).toMatchObject({
    amount: "0.10",
    certainty: "estimated",
  });
  expect(h.calls).toHaveLength(2);
});

it("uses not_available_yet only while nativeComposer.enabled is false", async () => {
  const control = await h.request("GET", h.catalogPath());
  expect(control.status).toBe(200);
  nativeComposer.enabled = false;
  for (const [method, tail, body] of [
    ["GET", h.catalogPath(), undefined],
    ["POST", "runs/preview", h.input],
    ["POST", "runs", h.body(crypto.randomUUID())],
    ["GET", `runs/${crypto.randomUUID()}`, undefined],
  ] as const) {
    const response = await h.request(method, tail, body, "disabled");
    expect(response.status).toBe(503);
    expect((await response.json()).details.reason).toBe("not_available_yet");
  }
  expect(await h.count()).toBe(0);
});

it("returns typed connection and admission refusals while the runtime is enabled", async () => {
  const quoteId = await h.preview();
  await h.sql.query("UPDATE provider_connections SET enabled=false");
  const catalog = await h.request("GET", h.catalogPath());
  expect(catalog.status).toBe(400);
  expect((await catalog.json()).details.reason).toBe("validation_failed");
  const created = await h.request("POST", "runs", h.body(quoteId), "refused");
  expect(created.status).toBe(200);
  expect((await created.json()).data).toEqual({
    kind: "not_dispatched",
    reason: "connection_unavailable",
    quote_invalidated: true,
  });
  expect(
    (
      await h.sql.query("SELECT rejection FROM model_playground_payment_quotes WHERE id=$1", [
        quoteId,
      ])
    ).rows,
  ).toEqual([{ rejection: "connection_unavailable" }]);
  expect(await h.count()).toBe(0);
  await h.sql.query(
    "UPDATE provider_connections SET enabled=true,\"credentialsEncrypted\"='changed-envelope'",
  );
  seams.provider.mockResolvedValue({
    ...h.adapter,
    probe: async () => {
      throw new ModelTransportError("invalid_credentials");
    },
  });
  const invalid = await h.request("GET", h.catalogPath());
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).details.reason).toBe("validation_failed");
});
