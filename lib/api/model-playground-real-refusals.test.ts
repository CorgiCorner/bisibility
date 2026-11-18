import "./model-playground-real.test-helpers";
import * as quotes from "@/lib/model-playground/admission-storage";
import * as launch from "@/lib/model-playground/launch";
import { expect, it, vi } from "vitest";
import { realServiceHarness, seams } from "./model-playground-real.test-helpers";
import { modelPlaygroundCreateSchema } from "./model-playground-schemas";
import { getModelPlaygroundService } from "./model-playground-service";

const h = realServiceHarness();

it.each([100, 101])(
  "enforces the %i-attempt confirmation boundary before quote reads",
  async (count) => {
    const quoteId = await h.preview();
    const body = {
      ...h.body(quoteId),
      consent: "non_guaranteed_estimate_v1" as const,
      version: 1 as const,
      confirmUnknown: {
        nonce: crypto.randomUUID(),
        contentHash: "a".repeat(64),
        attemptIds: Array.from({ length: count }, (_, index) => `attempt-${index}`),
      },
    };
    expect(modelPlaygroundCreateSchema.safeParse(body).success).toBe(true);
    const invoke = vi.spyOn(launch, "launchModelPlayground");
    const before = seams.transaction.mock.calls.length;
    const outcome = await getModelPlaygroundService().create(
      {
        actor: { id: h.project.ownerId, memberships: [{ projectId: h.project.id, role: "admin" }] },
        projectId: h.project.id,
        projectPublicId: h.projectId,
        entrySource: "api",
        credential: { id: h.auth.apiKey.id, kind: "project_key" },
      },
      body,
      "bounded",
    );
    expect(outcome.kind).toBe(count === 100 ? "admitted" : "validation_failed");
    if (count === 101) {
      expect(seams.transaction.mock.calls.length).toBe(before);
      expect(invoke).not.toHaveBeenCalled();
      expect(h.calls).toHaveLength(0);
      expect(await h.count()).toBe(0);
      expect((await h.request("POST", "runs", h.body(quoteId), "valid-after-cap")).status).toBe(
        200,
      );
    } else {
      expect(invoke).toHaveBeenCalledOnce();
    }
    expect(h.calls).toHaveLength(1);
    expect(await h.count()).toBe(1);
  },
);

it.each([
  { connected: true, valid: true },
  { connected: false, valid: true },
  { connected: true, valid: false },
])("authorizes preview before connection checks or parsing: %j", async ({ connected, valid }) => {
  const service = getModelPlaygroundService();
  const check = vi.spyOn(service, "checkConnection");
  const preview = vi.spyOn(service, "preview");
  if (!connected) await h.sql.query("UPDATE provider_connections SET enabled=false");
  const auth = { ...h.auth, apiKey: { ...h.auth.apiKey, scopes: ["read"] } };
  const before = seams.transaction.mock.calls.length;
  const response = await h.request("POST", "runs/preview", valid ? h.input : {}, undefined, auth);
  expect(response.status).toBe(403);
  // Preview declares write scope, so the shared router refuses a read-only key before the route runs.
  expect((await response.json()).type).toBe("https://bisibility.com/problems/forbidden");
  expect(check).not.toHaveBeenCalled();
  expect(preview).not.toHaveBeenCalled();
  expect(seams.transaction.mock.calls.length).toBe(before);
  expect(seams.provider).not.toHaveBeenCalled();
  expect(seams.decrypt).not.toHaveBeenCalled();
  expect(await h.count()).toBe(0);
  expect(h.calls).toHaveLength(0);
  expect((await h.request("GET", h.catalogPath(), undefined, undefined, auth)).status).toBe(
    connected ? 200 : 400,
  );
});

// Quoted -> validation refusal -> admitted; quoted -> deleted before launch -> not found.
// Neither pre-admission refusal rejects a quote or reserves a paid attempt.
it("maps an oversized confirmation to validation_failed and leaves the quote usable", async () => {
  const quoteId = await h.preview();
  const body = {
    ...h.body(quoteId),
    confirmUnknown: {
      nonce: crypto.randomUUID(),
      contentHash: "a".repeat(64),
      attemptIds: Array.from({ length: 101 }, (_, index) => `attempt-${index}`),
    },
  };
  expect(modelPlaygroundCreateSchema.safeParse(body).success).toBe(true);
  const refused = await h.request("POST", "runs", body, "invalid-launch");
  expect(refused.status).toBe(400);
  expect((await refused.json()).details.reason).toBe("validation_failed");
  expect(await h.count()).toBe(0);
  expect(h.calls).toHaveLength(0);
  const created = await h.request("POST", "runs", h.body(quoteId), "valid-launch");
  expect(created.status).toBe(200);
  expect((await created.json()).data).toMatchObject({ kind: "admitted", quote_id: quoteId });
  expect(await h.count()).toBe(1);
  expect(h.calls).toHaveLength(1);
});

it("maps a quote disappearing between the service and launch reads to not_found", async () => {
  const quoteId = await h.preview();
  const read = quotes.readModelPaymentQuote;
  vi.spyOn(quotes, "readModelPaymentQuote").mockImplementationOnce(async (tx, id) => {
    const retained = await read(tx, id);
    expect(retained?.quote.quoteId).toBe(quoteId);
    await tx.$executeRaw`DELETE FROM model_playground_payment_quotes WHERE id=${id}`;
    return retained;
  });
  const refused = await h.request("POST", "runs", h.body(quoteId), "disappeared");
  expect(refused.status).toBe(404);
  expect((await refused.json()).details.reason).toBe("not_found");
  expect(await h.count()).toBe(0);
  expect(h.calls).toHaveLength(0);
});

it("forbids an ownerless project's key on all four operations before connection or quote reads", async () => {
  expect((await h.request("GET", h.catalogPath())).status).toBe(200);
  const quoteId = await h.preview();
  // Even a real user whose ID collides with the fallback key ID cannot become the owner.
  await h.sql.query("INSERT INTO users VALUES($1,NULL)", [h.auth.apiKey.id]);
  await h.sql.query('UPDATE projects SET "ownerId"=NULL');
  const auth = { ...h.auth, project: { ...h.project, ownerId: null } };
  const before = seams.transaction.mock.calls.length;
  const decrypts = seams.decrypt.mock.calls.length;
  const probes = seams.provider.mock.calls.length;
  for (const [method, tail, body] of [
    ["GET", h.catalogPath(), undefined],
    ["POST", "runs/preview", h.input],
    ["POST", "runs", h.body(quoteId)],
    ["GET", `runs/${crypto.randomUUID()}`, undefined],
  ] as const) {
    const refused = await h.request(method, tail, body, "ownerless", auth);
    expect(refused.status).toBe(403);
    expect((await refused.json()).details.reason).toBe("forbidden");
  }
  expect(seams.user).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: h.auth.apiKey.id } }),
  );
  expect(seams.transaction.mock.calls.length).toBe(before);
  expect(seams.decrypt.mock.calls.length).toBe(decrypts);
  expect(seams.provider.mock.calls.length).toBe(probes);
  expect(await h.count()).toBe(0);
  expect(h.calls).toHaveLength(0);
});

it("denies a read-only member token on preview and create before connection checks", async () => {
  const service = getModelPlaygroundService();
  const check = vi.spyOn(service, "checkConnection");
  const preview = vi.spyOn(service, "preview");
  const create = vi.spyOn(service, "create");
  await h.sql.query("UPDATE memberships SET role='viewer' WHERE \"userId\"='actor'");
  const auth = {
    kind: "personal_token",
    user: { id: "actor" },
    token: { id: "fixture-pat", name: "Fixture", prefix: "bsb_pat", scopes: ["read", "write"] },
    memberships: [{ projectId: h.project.id, role: "viewer" }],
  };
  const before = seams.transaction.mock.calls.length;
  for (const [tail, body] of [
    ["runs/preview", h.input],
    ["runs", h.body(crypto.randomUUID())],
  ] as const) {
    const response = await h.request("POST", tail, body, `viewer-${tail}`, auth);
    expect(response.status).toBe(403);
  }
  expect(check).not.toHaveBeenCalled();
  expect(preview).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(seams.transaction.mock.calls.length).toBe(before);
  expect(seams.provider).not.toHaveBeenCalled();
  expect(seams.decrypt).not.toHaveBeenCalled();
  expect(await h.count()).toBe(0);
  expect(h.calls).toHaveLength(0);
  // Read access is real, and an update grant on the same member permits preview.
  expect((await h.request("GET", h.catalogPath(), undefined, undefined, auth)).status).toBe(200);
  await h.sql.query("UPDATE memberships SET role='member' WHERE \"userId\"='actor'");
  expect(
    (
      await h.request("POST", "runs/preview", h.input, undefined, {
        ...auth,
        memberships: [{ projectId: h.project.id, role: "member" }],
      })
    ).status,
  ).toBe(200);
});
