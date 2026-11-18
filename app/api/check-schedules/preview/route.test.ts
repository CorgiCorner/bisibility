import { AuthorizationError } from "@/lib/auth/authorize";
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mock = vi.hoisted(() => ({ preview: vi.fn(), session: vi.fn(), actor: vi.fn() }));
vi.mock("@/lib/actions/schedule-review", () => ({ previewScheduleChangeAction: mock.preview }));
vi.mock("@/lib/auth/session", () => ({ getSession: mock.session, requireSession: mock.session }));
vi.mock("@/lib/actions/_shared", async (original) => ({
  ...(await original<typeof import("@/lib/actions/_shared")>()),
  getActionActor: mock.actor,
}));
vi.mock("@/lib/api/admission-error-details", () => ({
  appAdmissionErrorDetails: async () => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.session.mockResolvedValue({ user: { id: "owner" } });
  mock.actor.mockResolvedValue({ id: "owner", memberships: [] });
});
it("delegates the read-only HTTP preview to the authenticated server action", async () => {
  const input = { projectId: "project", change: { op: "delete", id: "schedule" } };
  mock.preview.mockResolvedValue({ requires_review: false });
  const result = await POST(
    new Request("https://example.com/api/check-schedules/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  expect(mock.preview).toHaveBeenCalledWith(input);
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ data: { requires_review: false } });
});

it("rejects anonymous previews before calling the action", async () => {
  mock.session.mockResolvedValue(null);
  const response = await POST(
    new Request("https://example.com/api/check-schedules/preview", { method: "POST", body: "{}" }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mock.preview).not.toHaveBeenCalled();
});
it("preserves the action's permission refusal", async () => {
  mock.preview.mockRejectedValue(new AuthorizationError("forbidden"));
  const response = await POST(
    new Request("https://example.com/api/check-schedules/preview", { method: "POST", body: "{}" }),
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
