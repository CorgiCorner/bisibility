import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeAuditFailure } from "./audit";
import { AuthorizationError, authorize } from "./authorize";

vi.mock("server-only", () => ({}));
vi.mock("./audit", () => ({
  writeAuditFailure: vi.fn(() => Promise.resolve({ id: "audit_failure_1" })),
}));

const resourceTypes = ["personal_saved_view", "project_surface_preference"] as const;
const actions = ["create", "read", "update", "delete"] as const;
const viewer = {
  id: "user_1",
  role: "viewer" as const,
  memberships: [{ projectId: "project_1", role: "viewer" as const }],
};
const administrator = {
  ...viewer,
  role: "admin" as const,
  memberships: [{ projectId: "project_1", role: "admin" as const }],
};

describe("personal presentation authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(resourceTypes.flatMap((type) => actions.map((action) => ({ type, action }))))(
    "allows a viewer's own $action on $type without granting project writes",
    ({ type, action }) => {
      expect(
        authorize(viewer, action, { type, projectId: "project_1", ownerId: viewer.id }),
      ).toEqual({ actorId: viewer.id, projectId: "project_1", role: "viewer" });
      expect(() =>
        authorize(viewer, "update", { type: "keyword", projectId: "project_1" }),
      ).toThrow(AuthorizationError);
    },
  );

  it.each(
    resourceTypes.flatMap((type) =>
      actions.flatMap((action) =>
        ["user_2", null, undefined].map((ownerId) => ({ type, action, ownerId })),
      ),
    ),
  )(
    "rejects admin $action on $type without matching owner $ownerId",
    ({ type, action, ownerId }) => {
      expect(() =>
        authorize(administrator, action, { type, projectId: "project_1", ownerId }),
      ).toThrow(AuthorizationError);
      expect(writeAuditFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: administrator.id,
          action: `authorization.${action}.forbidden`,
          projectId: "project_1",
        }),
      );
    },
  );

  it.each(resourceTypes)("requires current project membership and project scope for %s", (type) => {
    expect(() =>
      authorize({ ...administrator, memberships: [] }, "read", {
        type,
        projectId: "project_1",
        ownerId: administrator.id,
      }),
    ).toThrow(AuthorizationError);
    expect(() => authorize(administrator, "update", { type, ownerId: administrator.id })).toThrow(
      AuthorizationError,
    );
  });
});
