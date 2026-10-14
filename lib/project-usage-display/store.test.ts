import { AuthorizationError } from "@/lib/auth/authorize";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { beforeEach, expect, it, vi } from "vitest";
import { UsageDisplayUnavailableError } from "./access";
import { defaultUsageDisplayOptions } from "./schema";
import {
  readProjectUsageDisplaySettings as read,
  saveProjectUsageDisplaySettings as save,
} from "./store";
import { displayDatabase, member, projectA, projectB } from "./store.test-fixture";

const audit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: audit,
  writeAuditFailure: () => Promise.resolve(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
const options = {
  moneyDisplay: "raw-unit" as const,
  moneyFractionDigits: 4,
  quantityFractionDigits: 4,
};
const command = { projectId: projectA, expectedRevision: 0, options };
beforeEach(() => audit.mockReset());

it("defaults to currency/2 without creating a row or modifying accounting", async () => {
  const f = displayDatabase();
  expect(await read(projectA, member(), f.db)).toEqual({
    projectId: projectA,
    revision: 0,
    options: defaultUsageDisplayOptions,
    canEdit: true,
  });
  expect(f.tx.project.update).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
});

it("persists once per project and another member/device reloads the same options", async () => {
  const f = displayDatabase();
  const saved = await save(command, member(), f.db);
  expect(saved).toMatchObject({ projectId: projectA, revision: 1, options });
  expect(await read(projectA, member("other"), f.db)).toEqual(saved);
  expect(f.tx.project.update).toHaveBeenCalledWith({
    where: { id: "A" },
    data: { usageDisplaySettings: { version: 1, revision: 1, options } },
  });
  expect(f.tx.projectDefaults.upsert).not.toHaveBeenCalled();
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      actorId: "editor",
      projectId: "A",
      targetId: projectA,
      before: { revision: 0, ...defaultUsageDisplayOptions },
      after: { revision: 1, ...options },
    }),
    f.tx,
  );
  expect(f.raw.mock.calls.some(([sql]) => sql.join("?").includes("FOR UPDATE"))).toBe(true);
});

it.each(["member", "admin", "owner"] as const)(
  "preserves existing %s project edit permission",
  async (role) => {
    const f = displayDatabase();
    f.memberships.set("editor:A", role);
    expect((await save(command, member(), f.db)).canEdit).toBe(true);
  },
);

it("isolates project configuration even when the same editor belongs to both", async () => {
  const f = displayDatabase();
  f.memberships.set("editor:B", "member");
  await save(command, member(), f.db);
  expect((await read(projectB, member(), f.db)).options).toEqual(defaultUsageDisplayOptions);
  expect(f.documents.has("B")).toBe(false);
});

it("does not trust actor-supplied ownership for a foreign project", async () => {
  const f = displayDatabase();
  const forged = { id: "editor", memberships: [{ projectId: "B", role: "owner" as const }] };
  await expect(read(projectB, forged, f.db)).rejects.toBeInstanceOf(AuthorizationError);
  await expect(save({ ...command, projectId: projectB }, forged, f.db)).rejects.toBeInstanceOf(
    AuthorizationError,
  );
  expect(f.tx.project.update).not.toHaveBeenCalled();
  expect(f.tx.project.update).not.toHaveBeenCalled();
});

it("allows viewer reads but denies forged viewer writes before persistence", async () => {
  const f = displayDatabase();
  expect((await read(projectA, member("viewer"), f.db)).canEdit).toBe(false);
  await expect(save(command, member("viewer"), f.db)).rejects.toBeInstanceOf(AuthorizationError);
  expect(f.tx.project.update).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
});

it.each(["migration_hold", "migrated"])(
  "retains readable settings but blocks writes in %s",
  async (mode) => {
    const f = displayDatabase();
    f.writeModes.set("A", mode);
    expect((await read(projectA, member(), f.db)).canEdit).toBe(false);
    await expect(save(command, member(), f.db)).rejects.toBeInstanceOf(ProjectReadOnlyError);
    expect(f.tx.project.update).not.toHaveBeenCalled();
  },
);

it("rechecks deactivated users and revoked membership instead of stale session facts", async () => {
  const f = displayDatabase();
  f.inactive.add("editor");
  await expect(read(projectA, member(), f.db)).rejects.toBeInstanceOf(AuthorizationError);
  f.inactive.clear();
  f.memberships.delete("editor:A");
  await expect(save(command, member(), f.db)).rejects.toBeInstanceOf(AuthorizationError);
  expect(f.tx.project.update).not.toHaveBeenCalled();
});

it("rejects unauthenticated reads and unknown project references", async () => {
  const f = displayDatabase();
  await expect(read(projectA, null, f.db)).rejects.toBeInstanceOf(AuthorizationError);
  await expect(read(`prj_${"c".repeat(24)}`, member(), f.db)).rejects.toBeInstanceOf(
    UsageDisplayUnavailableError,
  );
});

it("detects a second editor's stale revision without overwriting saved options", async () => {
  const f = displayDatabase();
  const first = await save(command, member(), f.db);
  await expect(
    save({ ...command, options: defaultUsageDisplayOptions }, member("other"), f.db),
  ).rejects.toMatchObject({ current: first });
  expect(f.tx.project.update).toHaveBeenCalledTimes(1);
  expect(audit).toHaveBeenCalledTimes(1);
  expect((await read(projectA, member("other"), f.db)).options).toEqual(options);
});

it("does not overwrite unknown future stored versions with defaults", async () => {
  const f = displayDatabase();
  f.documents.set("A", { version: 2, revision: 1, options });
  await expect(read(projectA, member(), f.db)).rejects.toBeInstanceOf(UsageDisplayUnavailableError);
  await expect(save(command, member(), f.db)).rejects.toBeInstanceOf(UsageDisplayUnavailableError);
  expect(f.tx.project.update).not.toHaveBeenCalled();
});

it.each([
  { ...command, options: { ...options, moneyFractionDigits: 5 } },
  { ...command, options: { ...options, quantityFractionDigits: 20 } },
  { ...command, options: { ...options, moneyDisplay: "EUR" } },
  { ...command, ownerId: "other" },
  { ...command, options: { ...options, exchangeRate: 1.2 } },
  { ...command, expectedRevision: -1 },
])("bounds options and rejects ownership/FX payloads before a transaction", async (input) => {
  const f = displayDatabase();
  await expect(save(input, member(), f.db)).rejects.toThrow();
  expect(f.transaction).not.toHaveBeenCalled();
});
