import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    instanceSetting: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));

import {
  changeInstanceAnnouncement,
  createInstanceAnnouncement,
  listEnabledInstanceAnnouncements,
  listInstanceAnnouncements,
} from "./store";

const id = "168337b6-c5e8-4787-a422-07ca4f693f32";
const revision = "868ff1da-17ec-4f41-9e80-09dfb19e2bc5";
const content = {
  title: "Maintenance",
  message: "Temporary issue",
  href: "https://status.example.com",
  linkLabel: "Status",
};
const stored = { ...content, enabled: true, revision, schemaVersion: 1 };
const key = `instance-announcement:${id}`;
const tx = {
  instanceSetting: {
    create: mocks.create,
    deleteMany: mocks.deleteMany,
    findUnique: mocks.findUnique,
    updateMany: mocks.updateMany,
  },
};

describe("instance announcement storage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.findUnique.mockResolvedValue({ key, value: JSON.stringify(stored) });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("keeps several prepared messages and only publishes enabled valid records", async () => {
    mocks.findMany.mockResolvedValue([
      { key, value: JSON.stringify(stored) },
      {
        key: `instance-announcement:${revision}`,
        value: JSON.stringify({ ...stored, enabled: false }),
      },
      { key, value: "not json" },
      { key, value: JSON.stringify({ ...stored, href: "javascript:alert(1)" }) },
    ]);
    expect(await listInstanceAnnouncements()).toHaveLength(2);
    expect(await listEnabledInstanceAnnouncements()).toEqual([
      { id, ...content, enabled: true, revision },
    ]);
  });

  it("creates an off message and records an audit without plaintext content", async () => {
    const result = await createInstanceAnnouncement("admin", content);
    expect(result).toMatchObject({ status: "saved", announcement: { ...content, enabled: false } });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "instance_admin.announcement_created",
        actorId: "admin",
        after: {
          announcementId: expect.any(String),
          contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          enabled: false,
        },
      }),
      tx,
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(content.message);
  });

  it("edits content without changing visibility and compares the previous stored value", async () => {
    const result = await changeInstanceAnnouncement(
      "admin",
      { id, revision },
      { content: { ...content, message: "Recovered" } },
    );
    expect(result).toMatchObject({
      status: "saved",
      announcement: { enabled: true, message: "Recovered" },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { key, value: JSON.stringify(stored) },
      data: { value: expect.any(String) },
    });
    if (result.status === "saved") expect(result.announcement.revision).not.toBe(revision);
  });

  it("toggles only the selected record and preserves content", async () => {
    expect(
      await changeInstanceAnnouncement("admin", { id, revision }, { enabled: false }),
    ).toMatchObject({
      status: "saved",
      announcement: { ...content, enabled: false },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "instance_admin.announcement_toggled" }),
      tx,
    );
  });

  it("rejects stale and concurrent edits without an audit or overwrite", async () => {
    expect(
      await changeInstanceAnnouncement("admin", { id, revision: id }, { enabled: false }),
    ).toEqual({ status: "conflict" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await changeInstanceAnnouncement("admin", { id, revision }, { enabled: false })).toEqual(
      { status: "conflict" },
    );
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("deletes a selected record with compare-and-swap and an audit", async () => {
    expect(await changeInstanceAnnouncement("admin", { id, revision }, { delete: true })).toEqual({
      status: "deleted",
      id,
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { key, value: JSON.stringify(stored) },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "instance_admin.announcement_deleted" }),
      tx,
    );
  });
});
