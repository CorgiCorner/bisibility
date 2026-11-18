import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { modelPlaygroundRoute } from "./model-playground";

const service = vi.hoisted(() => ({
  enabled: true,
  checkConnection: vi.fn(),
  catalog: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./model-playground-service", () => ({ getModelPlaygroundService: () => service }));

const projectId = "prj_a00000000000000000000000";
const project = {
  id: "project-internal",
  publicId: projectId,
  ownerId: "fixture-owner",
  writeMode: "writable",
};

function appContext(method: string, tail: string[]): ApiContext {
  const path = ["projects", projectId, "model-playground", ...tail];
  const url = new URL(`https://example.com/api/v1/${path.join("/")}`);
  return {
    actor: { id: "fixture-user", memberships: [{ projectId: project.id, role: "owner" }] },
    actorId: "fixture-user",
    auth: { kind: "native_session", project, scopes: ["read", "write"] } as never,
    headers: new Headers(),
    instance: "/api/v1/test",
    method,
    origin: { surface: "app", source: "app", credentialId: null, credentialKind: null },
    path,
    req: new Request(url, { method }),
    url,
  };
}

describe("Model Playground from an in-app session", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["GET", ["catalog"]],
    ["POST", ["runs", "preview"]],
    ["POST", ["runs"]],
    ["GET", ["runs", "019a70b2-0000-7000-8000-000000000003"]],
  ])("refuses %s %j without a programmatic credential", async (method, tail) => {
    const response = await modelPlaygroundRoute(appContext(method, tail));
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ status: 403, details: { reason: "forbidden" } });
    for (const call of [
      service.catalog,
      service.preview,
      service.create,
      service.read,
      service.checkConnection,
    ])
      expect(call).not.toHaveBeenCalled();
  });
});
