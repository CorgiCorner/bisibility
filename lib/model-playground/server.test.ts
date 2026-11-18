import { afterEach, beforeEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({ actor: vi.fn(), scope: vi.fn() }));
vi.mock("@/lib/actions/_shared", () => ({ getActionActor: m.actor, requireProjectScope: m.scope }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "fixture" }));

import { modelPlaygroundActorRuntime, modelPlaygroundRuntime } from "./server";

beforeEach(() => {
  m.actor.mockResolvedValue({ id: "actor" });
  m.scope.mockResolvedValue({ id: "project", ownerId: "owner", writeMode: "active" });
});
afterEach(() => {
  m.actor.mockReset();
  m.scope.mockReset();
});

test.each([
  { expectedOwner: "", liveOwner: "owner", allowed: false },
  { expectedOwner: undefined, liveOwner: "owner", allowed: false },
  { expectedOwner: undefined, liveOwner: undefined, allowed: false },
  { expectedOwner: "", liveOwner: "", allowed: false },
  { expectedOwner: "other", liveOwner: "owner", allowed: false },
  { expectedOwner: "owner", liveOwner: null, allowed: false },
  { expectedOwner: "owner", liveOwner: "owner", allowed: true },
])("checks project-key ownership explicitly: %j", async ({ expectedOwner, liveOwner, allowed }) => {
  m.scope.mockResolvedValue({ id: "project", ownerId: liveOwner, writeMode: "active" });
  const runtime = modelPlaygroundActorRuntime("project", m.actor, {
    projectId: "project",
    kind: "project_key",
    ...(expectedOwner === undefined ? {} : { ownerId: expectedOwner }),
  } as never);
  for (const action of ["read", "create"] as const) {
    if (allowed)
      await expect(runtime.authorize(action)).resolves.toMatchObject({ projectId: "project" });
    else await expect(runtime.authorize(action)).rejects.toMatchObject({ reason: "access_denied" });
  }
});
test("active project authorizes create", async () => {
  expect(await modelPlaygroundRuntime("project").authorize("create")).toMatchObject({
    actorId: "actor",
    projectId: "project",
  });
});
test("read-only project can read but cannot launch", async () => {
  m.scope.mockResolvedValue({ id: "project", ownerId: "owner", writeMode: "migration_hold" });
  const runtime = modelPlaygroundRuntime("project");
  await expect(runtime.authorize("read")).resolves.toMatchObject({ projectId: "project" });
  await expect(runtime.authorize("create")).rejects.toMatchObject({ reason: "access_denied" });
});
