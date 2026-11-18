import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  stop: vi.fn(),
  session: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/auth/session", () => ({ getOptionalAvailableSession: mocks.session }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./config", () => ({ assistantConfig: mocks.config }));
vi.mock("./conversations", () => ({
  getAssistantConversation: vi.fn(),
  listAssistantConversations: vi.fn(),
}));
vi.mock("./credentials", () => ({
  saveAssistantCredential: mocks.save,
  removeAssistantCredential: mocks.remove,
}));
vi.mock("./run-control", () => ({ stopAssistantRun: mocks.stop }));

import {
  deleteAssistantCredential,
  getAssistantConfig,
  postAssistantCredential,
  postAssistantStop,
} from "./http";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
test("config is session-scoped and mutating credentials require same origin", async () => {
  vi.stubEnv("ASSISTANT_ENABLED", "1");
  mocks.session.mockResolvedValue({ user: { id: "user" }, session: { id: "session" } });
  mocks.config.mockResolvedValue({ enabled: false, reason: "not_configured" });
  const config = await getAssistantConfig(
    new Request("https://app.example/api/assistant/config?project=prj_test"),
  );
  expect(await config.json()).toEqual({ enabled: false, reason: "not_configured" });
  expect(mocks.config).toHaveBeenCalledWith("prj_test", "user");
  const denied = await postAssistantCredential(
    new Request("https://app.example/api/assistant/credentials", {
      method: "POST",
      headers: { origin: "https://other.example" },
      body: "{}",
    }),
  );
  expect(denied.status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.record).not.toHaveBeenCalled();
});
test("committed assistant mutations record App activity for the session user", async () => {
  vi.stubEnv("ASSISTANT_ENABLED", "1");
  const session = { user: { id: "user", email: "a@example.test" }, session: { id: "session" } };
  mocks.session.mockResolvedValue(session);
  mocks.remove.mockResolvedValue({ ok: true });
  mocks.stop.mockRejectedValue(new Error("stop failed"));
  const init = { method: "POST", headers: { origin: "https://app.example" } };
  const removed = await deleteAssistantCredential(
    new Request("https://app.example/api/assistant/credentials/cred", {
      ...init,
      method: "DELETE",
    }),
    "cred",
  );
  expect(removed.status).toBe(200);
  expect(mocks.record).toHaveBeenCalledExactlyOnceWith(session);
  const failed = await postAssistantStop(
    new Request("https://app.example/api/assistant/runs/run/stop", init),
    "run",
  );
  expect(failed.status).toBe(500);
  expect(mocks.record).toHaveBeenCalledOnce();
});
