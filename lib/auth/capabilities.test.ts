import type { Role } from "@/lib/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { canDeleteProjectSavedView, canProjectAction, canReadProjectAudit } from "./capabilities";

const roles = ["viewer", "auditor", "member", "admin", "owner"] satisfies Role[];

describe("canProjectAction", () => {
  it.each([
    ["viewer", true, false, false, false, false],
    ["auditor", true, false, false, false, false],
    ["member", true, true, true, false, false],
    ["admin", true, true, true, true, false],
    ["owner", true, true, true, true, true],
  ] as const)(
    "derives the documented thresholds for %s",
    (role, read, create, update, manage, ownerOnly) => {
      expect(canProjectAction(role, "read", "keyword")).toBe(read);
      expect(canProjectAction(role, "create", "keyword")).toBe(create);
      expect(canProjectAction(role, "update", "keyword")).toBe(update);
      expect(canProjectAction(role, "delete", "keyword")).toBe(manage);
      expect(canProjectAction(role, "manage", "provider_connection")).toBe(manage);
      expect(canProjectAction(role, "manage", "billing")).toBe(ownerOnly);
      expect(canProjectAction(role, "delete", "project")).toBe(ownerOnly);
    },
  );

  it("keeps every role readable and owner-only resources isolated", () => {
    expect(roles.filter((role) => canProjectAction(role, "read", "project"))).toEqual(roles);
    expect(roles.filter((role) => canProjectAction(role, "manage", "ownership"))).toEqual([
      "owner",
    ]);
  });

  it("allows audit navigation only for auditor and admin-level roles", () => {
    expect(roles.filter(canReadProjectAudit)).toEqual(["auditor", "admin", "owner"]);
  });

  it.each([
    ["viewer", false, false],
    ["auditor", false, false],
    ["member", true, false],
    ["admin", true, true],
    ["owner", true, true],
  ] as const)(
    "derives saved-view deletion from ownership for %s",
    (role, canDeleteOwn, canDeleteOthers) => {
      expect(canDeleteProjectSavedView(role, "actor-1", "actor-1")).toBe(canDeleteOwn);
      expect(canDeleteProjectSavedView(role, "actor-1", "actor-2")).toBe(canDeleteOthers);
      expect(canDeleteProjectSavedView(role, "actor-1", null)).toBe(canDeleteOthers);
    },
  );
});
