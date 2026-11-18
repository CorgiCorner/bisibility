import { expect, test, vi } from "vitest";
import { createServerModelPlaygroundService, serverModelCatalogLoader } from "./client-service";
import { catalog } from "./contract-fixtures.test-support";

const actions = vi.hoisted(() => ({
  previewModelPlaygroundAction: vi.fn(),
  launchModelPlaygroundAction: vi.fn(),
  readModelPlaygroundAction: vi.fn(),
  getModelPlaygroundCatalogAction: vi.fn(),
}));
vi.mock("@/lib/actions/model-playground", () => actions);
const service = createServerModelPlaygroundService("project");
const request = {
  version: 1 as const,
  requestId: crypto.randomUUID(),
  previewId: crypto.randomUUID(),
  quoteToken: "quote",
  configHash: "a".repeat(64),
  revision: "revision",
};

test.each([
  "confirmation_required",
  "not_dispatched",
  "run_not_created",
  "invalid_request",
  "access_denied",
  "feature_disabled",
  "uncertain",
])("preserves the typed %s outcome from the action", async (kind) => {
  const outcome = {
    kind,
    message: "Safe text",
    nonce: "nonce",
    contentHash: "a".repeat(64),
    attemptIds: ["attempt"],
    earlierAttemptUnconfirmed: true,
  };
  actions.launchModelPlaygroundAction.mockResolvedValue(outcome);
  await expect(service.launch(request)).rejects.toEqual(outcome);
  actions.launchModelPlaygroundAction.mockResolvedValue({
    kind: "admitted",
    result: { runId: "run", columns: [] },
  });
  await expect(service.launch(request)).resolves.toEqual({ runId: "run", columns: [] });
});

test("catalog loader carries workspace and checks cancellation before the server action", async () => {
  const load = serverModelCatalogLoader("project");
  const scope = {
    providerId: "anthropic" as const,
    connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa" as const,
    workspaceId: "wrkspc_Fixture",
  };
  actions.getModelPlaygroundCatalogAction.mockResolvedValue({
    kind: "catalog",
    catalog: catalog(),
  });
  expect(await load(scope, new AbortController().signal)).toEqual(catalog());
  expect(actions.getModelPlaygroundCatalogAction).toHaveBeenLastCalledWith("project", scope);
  actions.getModelPlaygroundCatalogAction.mockClear();
  await expect(load(scope, AbortSignal.abort())).rejects.toThrow();
  expect(actions.getModelPlaygroundCatalogAction).not.toHaveBeenCalled();
});

test("read uses only the read action and never launch", async () => {
  actions.launchModelPlaygroundAction.mockClear();
  actions.readModelPlaygroundAction.mockResolvedValue({ runId: "run", columns: [] });
  expect(await service.read?.("run")).toEqual({ runId: "run", columns: [] });
  expect(actions.readModelPlaygroundAction).toHaveBeenCalledWith("project", "run");
  expect(actions.launchModelPlaygroundAction).not.toHaveBeenCalled();
});
