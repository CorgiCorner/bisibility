import { ModelAdmissionRefusal } from "@/lib/model-playground/payment";
import { beforeEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({
  enabled: { enabled: true },
  authorize: vi.fn(),
  resolve: vi.fn(),
  preview: vi.fn(),
  launch: vi.fn(),
  read: vi.fn(),
  legacy: vi.fn(),
  actor: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", () => ({ getActionActor: m.actor, requireProjectScope: m.scope }));
vi.mock("@/lib/actions/ai-research", () => ({ getAiResearchPage: m.legacy }));
vi.mock("@/lib/ai-research/model-playground-context", () => ({
  loadModelPlaygroundContext: async () => ({
    entities: [],
    topics: [],
    sourceOverrides: [],
    projectName: "Fixture",
  }),
}));
vi.mock("@/lib/model-playground/server", () => ({
  nativeComposer: m.enabled,
  modelPlaygroundRuntime: () => ({
    authorize: m.authorize,
    resolve: m.resolve,
    db: { $transaction: (work: (tx: unknown) => unknown) => work({}) },
  }),
}));
vi.mock("@/lib/model-playground/preview", () => ({ previewModelPlayground: m.preview }));
vi.mock("@/lib/model-playground/launch", () => ({ launchModelPlayground: m.launch }));
vi.mock("@/lib/model-playground/read", () => ({ readModelPlayground: m.read }));
vi.mock("@/lib/model-playground/page", () => ({
  loadNativeModelComposer: async () => ({ enabled: true }),
}));

import {
  getModelPlaygroundCatalogAction,
  getModelPlaygroundPage,
  launchModelPlaygroundAction,
  previewModelPlaygroundAction,
} from "./model-playground";

beforeEach(() => {
  m.enabled.enabled = true;
  for (const mock of [m.authorize, m.resolve, m.preview, m.launch, m.legacy]) mock.mockReset();
  m.authorize.mockResolvedValue({
    actorId: "actor",
    projectId: "internal",
    principal: "owner",
    namespace: "fixture",
  });
  m.actor.mockResolvedValue({ id: "actor", memberships: [] });
  m.scope.mockResolvedValue({
    id: "internal",
    publicId: "project",
    ownerId: "owner",
    writeMode: "active",
    domain: "example.com",
  });
});

test("native actions authorize before malformed data, metadata, preview or admission", async () => {
  m.resolve.mockResolvedValue({ catalog: { models: [] } });
  expect(
    (
      await getModelPlaygroundCatalogAction("project", {
        providerId: "openai",
        connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
      })
    ).kind,
  ).toBe("catalog");
  m.resolve.mockClear();
  m.authorize.mockRejectedValue(new Error("Denied"));
  expect((await getModelPlaygroundCatalogAction("project", {})).kind).toBe("access_denied");
  expect((await previewModelPlaygroundAction("project", { revision: "r", input: {} })).kind).toBe(
    "access_denied",
  );
  expect((await launchModelPlaygroundAction("project", {})).kind).toBe("access_denied");
  expect(m.resolve).not.toHaveBeenCalled();
  expect(m.preview).not.toHaveBeenCalled();
  expect(m.launch).not.toHaveBeenCalled();
});

test("disabled native flag preserves legacy page loader and refuses native launch", async () => {
  m.enabled.enabled = false;
  m.legacy.mockResolvedValue({ canRun: true, sentinel: "legacy" });
  expect(await getModelPlaygroundPage("project")).toMatchObject({
    sentinel: "legacy",
    nativeComposer: undefined,
  });
  expect(m.legacy).toHaveBeenCalledWith("project", "prompt");
  expect((await launchModelPlaygroundAction("project", {})).kind).toBe("feature_disabled");
  expect(m.launch).not.toHaveBeenCalled();
});

test("enabled native page never loads the legacy provider catalog", async () => {
  expect(await getModelPlaygroundPage("project")).toMatchObject({
    nativeComposer: { enabled: true },
  });
  expect(m.legacy).not.toHaveBeenCalled();
});

test("known preview and catalog refusals stay typed; unexpected failures stay uncertain", async () => {
  const request = { providerId: "openai", connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa" };
  m.preview.mockRejectedValue(new ModelAdmissionRefusal("budget_unavailable"));
  m.resolve.mockRejectedValue(new ModelAdmissionRefusal("credential_changed"));
  expect(await previewModelPlaygroundAction("project", { revision: "r", input: {} })).toMatchObject(
    { kind: "refused", reason: "budget_unavailable" },
  );
  expect(await getModelPlaygroundCatalogAction("project", request)).toMatchObject({
    kind: "refused",
    reason: "credential_changed",
  });
  m.preview.mockRejectedValue(new Error("Synthetic database error"));
  m.resolve.mockRejectedValue(new Error("Synthetic database error"));
  expect((await previewModelPlaygroundAction("project", { revision: "r", input: {} })).kind).toBe(
    "uncertain",
  );
  expect((await getModelPlaygroundCatalogAction("project", request)).kind).toBe("uncertain");
});

test("disabled launch still checks authorization first and never enters admission", async () => {
  m.enabled.enabled = false;
  m.authorize.mockRejectedValue(new Error("Denied"));
  expect((await launchModelPlaygroundAction("project", null)).kind).toBe("access_denied");
  expect(m.authorize).toHaveBeenCalledExactlyOnceWith("create");
  expect(m.launch).not.toHaveBeenCalled();
});
