import { describe, expect, it, vi } from "vitest";
import { resolveRankCheckAttribution } from "./run-attribution";

function dbWithRun(run: Record<string, unknown> | null) {
  return {
    rankCheckRunItem: {
      findUnique: vi.fn(async () => (run ? { run } : null)),
    },
  } as never as Parameters<typeof resolveRankCheckAttribution>[1];
}

describe("resolveRankCheckAttribution", () => {
  it("attributes a run item to its run's stored origin and credential", async () => {
    const db = dbWithRun({
      credentialId: "client-1",
      credentialKind: "oauth_client",
      source: "mcp",
      trigger: "manual",
    });

    await expect(
      resolveRankCheckAttribution({ runItemId: "item_1", source: "dispatcher" }, db),
    ).resolves.toEqual({
      credential: { id: "client-1", kind: "oauth_client" },
      source: "mcp",
      trigger: "manual",
    });
    expect(db.rankCheckRunItem.findUnique).toHaveBeenCalledWith({
      select: {
        run: { select: { credentialId: true, credentialKind: true, source: true, trigger: true } },
      },
      where: { id: "item_1" },
    });
  });

  it("maps a stored scheduled trigger to the scheduled attribution", async () => {
    await expect(
      resolveRankCheckAttribution(
        { runItemId: "item_1", source: "dispatcher" },
        dbWithRun({
          credentialId: null,
          credentialKind: null,
          source: "api",
          trigger: "scheduled",
        }),
      ),
    ).resolves.toEqual({ source: "api", trigger: "scheduled" });
  });

  it.each([
    [
      "unknown stored source",
      { credentialId: null, credentialKind: null, source: "ghost", trigger: "scheduled" },
    ],
    [
      "legacy worker source",
      { credentialId: null, credentialKind: null, source: "worker", trigger: "scheduled" },
    ],
  ])("falls back to the app surface for an %s", async (_label, run) => {
    await expect(
      resolveRankCheckAttribution({ runItemId: "item_1", source: "dispatcher" }, dbWithRun(run)),
    ).resolves.toEqual({ source: "app", trigger: "scheduled" });
  });

  it("omits the credential when only one of its columns is set", async () => {
    await expect(
      resolveRankCheckAttribution(
        { runItemId: "item_1", source: "dispatcher" },
        dbWithRun({ credentialId: "pat_1", credentialKind: null, source: "sdk", trigger: "api" }),
      ),
    ).resolves.toEqual({ source: "sdk", trigger: "manual" });
  });

  it("omits the credential when the stored kind is unknown", async () => {
    await expect(
      resolveRankCheckAttribution(
        { runItemId: "item_1", source: "dispatcher" },
        dbWithRun({
          credentialId: "key_1",
          credentialKind: "mystery",
          source: "sdk",
          trigger: "api",
        }),
      ),
    ).resolves.toEqual({ source: "sdk", trigger: "manual" });
  });

  it("falls back to app/manual for a manual source without a readable run item", async () => {
    await expect(
      resolveRankCheckAttribution({ runItemId: "item_gone", source: "manual" }, dbWithRun(null)),
    ).resolves.toEqual({ source: "app", trigger: "manual" });
  });

  it.each(["ambiguous", "dispatcher", "legacy"] as const)(
    "attributes %s execution without a run item to the app surface as scheduled",
    async (source) => {
      await expect(resolveRankCheckAttribution({ source }, dbWithRun(null))).resolves.toEqual({
        source: "app",
        trigger: "scheduled",
      });
    },
  );

  it("attributes a manual execution without a run item id to the app surface as manual", async () => {
    const db = dbWithRun(null);
    await expect(resolveRankCheckAttribution({ source: "manual" }, db)).resolves.toEqual({
      source: "app",
      trigger: "manual",
    });
    expect(db.rankCheckRunItem.findUnique).not.toHaveBeenCalled();
  });
});
