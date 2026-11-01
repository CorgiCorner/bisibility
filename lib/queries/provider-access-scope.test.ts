import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ project: vi.fn(), demo: vi.fn() }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.project }));
vi.mock("@/lib/demo/account-view", () => ({ resolveDemoAccountView: mocks.demo }));

import { readProjectProviderAccessScope } from "./provider-access-scope";

beforeEach(() => {
  mocks.demo.mockResolvedValue("normal");
});
it.each([
  ["owner", true],
  ["admin", true],
  ["member", false],
  ["viewer", false],
  ["auditor", false],
])("projects provider management for %s without authorizing billing", async (role, expected) => {
  mocks.project.mockResolvedValue({
    actor: { id: "actor", memberships: [{ projectId: "internal", role }] },
    project: { id: "internal", publicId: "prj_example", ownerId: "owner", writeMode: "active" },
  });
  expect((await readProjectProviderAccessScope("prj_example")).scope).toEqual({
    canManageProviders: expected,
    projectRef: "prj_example",
    readOnly: false,
  });
});
it("does not inherit an admin role from another project", async () => {
  mocks.project.mockResolvedValue({
    actor: {
      id: "actor",
      role: "owner",
      memberships: [
        { projectId: "other", role: "admin" },
        { projectId: "internal", role: "viewer" },
      ],
    },
    project: { id: "internal", publicId: "prj_example", writeMode: "active" },
  });
  expect((await readProjectProviderAccessScope("prj_example")).scope.canManageProviders).toBe(
    false,
  );
});
it("hides mutations on a read-only project", async () => {
  mocks.project.mockResolvedValue({
    actor: { id: "actor", memberships: [{ projectId: "internal", role: "owner" }] },
    project: { id: "internal", publicId: "prj_example", writeMode: "migration_hold" },
  });
  expect((await readProjectProviderAccessScope("prj_example")).scope).toMatchObject({
    canManageProviders: false,
    readOnly: true,
  });
});
it("hides commercial setup for demo visitors", async () => {
  mocks.demo.mockResolvedValue("locked");
  mocks.project.mockResolvedValue({
    actor: { id: "actor", memberships: [{ projectId: "internal", role: "owner" }] },
    project: { id: "internal", publicId: "prj_example", writeMode: "active" },
  });
  expect((await readProjectProviderAccessScope("prj_example")).scope).toMatchObject({
    canManageProviders: false,
    readOnly: true,
  });
});
it("lets the configured demo owner manage providers and budgets", async () => {
  mocks.demo.mockResolvedValue("normal");
  mocks.project.mockResolvedValue({
    actor: { id: "demo-owner", memberships: [{ projectId: "internal", role: "owner" }] },
    project: { id: "internal", publicId: "prj_example", writeMode: "active" },
  });
  expect((await readProjectProviderAccessScope("prj_example")).scope).toMatchObject({
    canManageProviders: true,
    readOnly: false,
  });
  expect(mocks.demo).toHaveBeenCalledWith("demo-owner");
});
