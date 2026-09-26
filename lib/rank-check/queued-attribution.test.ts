import { describe, expect, it, vi } from "vitest";
import { queuedBatchAttribution, queuedBatchOrigin } from "./queued-attribution";

function txWithRun(run: Record<string, unknown> | null) {
  return {
    rankCheckRun: {
      findUnique: vi.fn(async () => run),
    },
  } as never as Parameters<typeof queuedBatchOrigin>[0];
}

describe("queuedBatchOrigin", () => {
  it("writes the app surface and scheduled trigger for a dispatcher batch without a run", async () => {
    const tx = txWithRun(null);
    await expect(queuedBatchOrigin(tx, undefined)).resolves.toEqual({
      credentialId: null,
      credentialKind: null,
      source: "app",
      trigger: "scheduled",
    });
    expect(tx.rankCheckRun.findUnique).not.toHaveBeenCalled();
  });

  it("carries its run's origin onto a run batch", async () => {
    const tx = txWithRun({
      credentialId: "pat_1",
      credentialKind: "personal_token",
      source: "sdk",
      trigger: "api",
    });
    await expect(queuedBatchOrigin(tx, "run_1")).resolves.toEqual({
      credentialId: "pat_1",
      credentialKind: "personal_token",
      source: "sdk",
      trigger: "manual",
    });
    expect(tx.rankCheckRun.findUnique).toHaveBeenCalledWith({
      select: { credentialId: true, credentialKind: true, source: true, trigger: true },
      where: { id: "run_1" },
    });
  });

  it("keeps the scheduled trigger of a scheduled run", async () => {
    await expect(
      queuedBatchOrigin(
        txWithRun({
          credentialId: null,
          credentialKind: null,
          source: "api",
          trigger: "scheduled",
        }),
        "run_1",
      ),
    ).resolves.toMatchObject({ source: "api", trigger: "scheduled" });
  });

  it.each([
    ["unknown stored source", "ghost"],
    ["legacy worker source", "worker"],
  ])("falls back to the app source for an %s", async (_label, source) => {
    await expect(
      queuedBatchOrigin(
        txWithRun({ credentialId: null, credentialKind: null, source, trigger: "scheduled" }),
        "run_1",
      ),
    ).resolves.toMatchObject({ source: "app" });
  });

  it("falls back to the app surface when the run row is gone", async () => {
    await expect(queuedBatchOrigin(txWithRun(null), "run_gone")).resolves.toEqual({
      credentialId: null,
      credentialKind: null,
      source: "app",
      trigger: "scheduled",
    });
  });
});

describe("queuedBatchAttribution", () => {
  it("uses the batch's stored source, trigger and credential", () => {
    expect(
      queuedBatchAttribution({
        credentialId: "key_1",
        credentialKind: "project_key",
        source: "api",
        trigger: "manual",
      }),
    ).toEqual({
      credential: { id: "key_1", kind: "project_key" },
      source: "api",
      trigger: "manual",
    });
  });

  it("yields app/scheduled and no credential for a legacy batch without stored columns", () => {
    expect(
      queuedBatchAttribution({
        credentialId: null,
        credentialKind: null,
        source: null,
        trigger: null,
      }),
    ).toEqual({ source: "app", trigger: "scheduled" });
  });

  it.each(["ghost", "worker"])("maps a stored source %s to the app surface", (source) => {
    expect(
      queuedBatchAttribution({
        credentialId: null,
        credentialKind: null,
        source,
        trigger: "scheduled",
      }),
    ).toEqual({ source: "app", trigger: "scheduled" });
  });

  it("omits the credential when only one of its columns is set", () => {
    expect(
      queuedBatchAttribution({
        credentialId: "key_1",
        credentialKind: null,
        source: "api",
        trigger: null,
      }),
    ).toEqual({ source: "api", trigger: "scheduled" });
  });

  it("omits the credential when the stored kind is unknown", () => {
    expect(
      queuedBatchAttribution({
        credentialId: "key_1",
        credentialKind: "mystery",
        source: "api",
        trigger: null,
      }),
    ).toEqual({ source: "api", trigger: "scheduled" });
  });
});
