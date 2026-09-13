import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: mocks.config }));
vi.mock("@/lib/demo/identity", () => ({ loadConfiguredDemoActor: mocks.actor }));

import { prepareDemoSessionCreation } from "./session-policy";

const viewerSession = { expiresAt: new Date("2026-09-10T18:00:00.000Z"), userId: "viewer_db" };
const ownerSession = { expiresAt: new Date("2026-10-10T12:00:00.000Z"), userId: "owner_db" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
  mocks.config.mockReturnValue({ kind: "editable" });
});
afterEach(() => vi.useRealTimers());

it("gives editable viewer sessions an independent two-hour database expiry", async () => {
  mocks.actor.mockResolvedValue({ id: "viewer_db", kind: "viewer" });
  await expect(prepareDemoSessionCreation(viewerSession)).resolves.toEqual({
    ...viewerSession,
    expiresAt: new Date("2026-09-10T14:00:00.000Z"),
  });
});

it("keeps the configured owner's thirty-day creation expiry and rejects identity drift", async () => {
  mocks.actor.mockResolvedValue({ id: "owner_db", kind: "owner" });
  await expect(prepareDemoSessionCreation(ownerSession)).resolves.toEqual(ownerSession);
  mocks.actor.mockResolvedValue(null);
  await expect(prepareDemoSessionCreation(viewerSession)).rejects.toMatchObject({
    status: "FORBIDDEN",
  });
});
