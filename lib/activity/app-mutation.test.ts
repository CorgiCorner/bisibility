import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ activity: vi.fn(), headers: vi.fn() }));
vi.mock("./record-extension", () => ({ recordUserActivity: mocks.activity }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { recordAppAction } from "./app-mutation";

const actor = { id: "user", email: "u@example.test" };
const request = (path = "/app/projects", method = "POST") =>
  new Headers({
    "x-bisibility-request-path": path,
    "x-bisibility-request-method": method,
    "next-action": "mutation",
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(request());
});
it("records the already authenticated actor", async () => {
  recordAppAction(actor);
  await vi.waitFor(() =>
    expect(mocks.activity).toHaveBeenCalledExactlyOnceWith({
      userId: actor.id,
      email: actor.email,
      channel: "app",
      kind: "acted",
      interactive: true,
    }),
  );
});
it("never delays the mutation on header availability", async () => {
  mocks.headers.mockReturnValue(new Promise(() => {}));
  expect(recordAppAction(actor)).toBeUndefined();
  expect(mocks.activity).not.toHaveBeenCalled();
});
it.each([
  ["/app/projects", "GET"],
  ["/api/v1/projects", "POST"],
  ["/api/mcp", "POST"],
])("excludes reads and bearer channels: %s %s", async (path, method) => {
  mocks.headers.mockResolvedValue(request(path, method));
  recordAppAction(actor);
  await Promise.resolve();
  expect(mocks.activity).not.toHaveBeenCalled();
});
it("contains synchronous and asynchronous recorder failures", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.activity.mockImplementationOnce(() => {
    throw new Error("offline");
  });
  recordAppAction(actor);
  await vi.waitFor(() => expect(console.error).toHaveBeenCalledTimes(1));
  mocks.activity.mockRejectedValueOnce(new Error("offline"));
  recordAppAction(actor);
  await vi.waitFor(() => expect(console.error).toHaveBeenCalledTimes(2));
});
