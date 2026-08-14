import { describe, expect, it } from "vitest";
import { isValidPublicId, parsePublicId } from "./public-id";
import { addPublicIdsToArgs, addPublicIdsToData, withPublicIdWrites } from "./public-id-writes";

function publicId(data: unknown) {
  return (data as { publicId?: string }).publicId ?? "";
}

describe("public ID Prisma write defaults", () => {
  it("adds a strict v3 ID for every addressable model", () => {
    const models = [
      "AlertRule",
      "ApiKey",
      "AuditLog",
      "CloudImportJob",
      "Competitor",
      "IngestHook",
      "Invite",
      "Keyword",
      "Membership",
      "MigrationToken",
      "Notification",
      "PersonalAccessToken",
      "Project",
      "ProjectMarket",
      "ProviderConnection",
      "RankCheck",
      "SavedKeyword",
      "SavedView",
      "Session",
      "Signal",
      "Tag",
      "TriggeredAlert",
      "User",
      "WebhookEndpoint",
    ] as const;

    for (const model of models) {
      const value = publicId(addPublicIdsToData(model, {}));
      expect(isValidPublicId(value)).toBe(true);
    }
  });

  it("keeps an explicitly supplied v3 ID and fills nested creates", () => {
    const project = addPublicIdsToData("Project", {
      members: { create: { role: "owner", userId: "user_1" } },
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      tags: { createMany: { data: [{ name: "urgent" }] } },
    });
    const members = project.members as { create: Record<string, unknown> };
    const tags = project.tags as { createMany: { data: Array<Record<string, unknown>> } };

    expect(project.publicId).toBe("prj_abcdefghijklmnopqrstuvwx");
    expect(parsePublicId(publicId(members.create))?.resource).toBe("membership");
    expect(parsePublicId(publicId(tags.createMany.data[0]))?.resource).toBe("tag");
  });

  it("fills create, update nested create, upsert, and createMany shapes", () => {
    const args = addPublicIdsToArgs("User", "create", {
      create: { email: "test@example.com" },
      data: [{ email: "one@example.com" }, { email: "two@example.com" }],
    }) as {
      create: Record<string, unknown>;
      data: Array<Record<string, unknown>>;
    };
    const update = addPublicIdsToArgs("User", "update", {
      data: { sessions: { create: { token: "token" } } },
    }) as { data: { sessions: { create: Record<string, unknown> } } };

    expect(parsePublicId(publicId(args.create))?.resource).toBe("user");
    expect(args.data.map(publicId).every(isValidPublicId)).toBe(true);
    expect(parsePublicId(publicId(update.data.sessions.create))?.resource).toBe("session");
  });

  it("does not rotate an existing ID during updates or upsert update branches", () => {
    const update = addPublicIdsToArgs("Project", "update", {
      data: { name: "Renamed", publicId: "prj_legacy" },
    }) as { data: { publicId: string } };
    const upsert = addPublicIdsToArgs("Project", "upsert", {
      create: { name: "New" },
      update: { publicId: "prj_legacy" },
    }) as { create: { publicId: string }; update: { publicId: string } };

    expect(update.data.publicId).toBe("prj_legacy");
    expect(upsert.update.publicId).toBe("prj_legacy");
    expect(parsePublicId(upsert.create.publicId)?.resource).toBe("project");
  });

  it("rejects supplied legacy, malformed, and wrong-prefix IDs on creates", () => {
    for (const publicId of ["prj_legacy", "kw_abcdefghijklmnopqrstuvwx", 42]) {
      expect(() => addPublicIdsToData("Project", { publicId })).toThrow(
        "Project.publicId must be a strict prj_ v3 public ID.",
      );
    }
  });

  it("wraps lowercase Prisma delegates and interactive transaction clients", async () => {
    const received: unknown[] = [];
    const delegate = {
      create(args: unknown) {
        received.push(args);
        return args;
      },
    };
    const raw = {
      project: delegate,
      $transaction(callback: (transaction: { project: typeof delegate }) => unknown) {
        return callback({ project: delegate });
      },
    };
    const prisma = withPublicIdWrites(raw);

    await prisma.project.create({ data: { name: "direct" } });
    await prisma.$transaction((transaction) =>
      transaction.project.create({ data: { name: "transactional" } }),
    );

    for (const call of received) {
      const data = (call as { data: Record<string, unknown> }).data;
      expect(parsePublicId(publicId(data))?.resource).toBe("project");
    }
  });
});
