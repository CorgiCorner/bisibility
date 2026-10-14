import { describe, expect, it, vi } from "vitest";
import { personalSessionUserId, sessionSavedViewContext } from "./context";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn() }));
describe("trusted session identity boundary", () => {
  const actor = { id: "user-a", memberships: [{ projectId: "project-a", role: "admin" as const }] };
  it("does not elevate a PAT/project key through a matching browser actor or omitted transport", () => {
    expect(() => personalSessionUserId({ actor, auditActorId: actor.id })).toThrow();
    expect(() =>
      personalSessionUserId({ actor, auditActorId: actor.id, transport: "project_api" }),
    ).toThrow();
    expect(personalSessionUserId(sessionSavedViewContext(actor))).toBe("user-a");
  });
  it("refuses a trusted adapter identity mismatch even for an admin", () => {
    expect(() =>
      personalSessionUserId({
        actor,
        auditActorId: "user-b",
        sessionUserId: "user-b",
        transport: "session",
      }),
    ).toThrow();
  });
});
