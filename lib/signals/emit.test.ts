import { beforeEach, describe, expect, it, vi } from "vitest";
import { emitSignal, emitSignalSafe, type PrismaClientLike } from "./emit";
import { SIGNAL_TYPES, type SignalInput } from "./types";

const mocks = vi.hoisted(() => ({
  makePublicId: vi.fn((prefix: string) => `${prefix}_generated`),
  prisma: {
    signal: { create: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/db/public-id", () => ({ makePublicId: mocks.makePublicId }));

const happenedAt = new Date("2026-07-04T19:30:00.000Z");

function signalInput(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    createdById: "user_1",
    happenedAt,
    keywordId: "keyword_1",
    payload: { note: "manual context" },
    projectId: "project_1",
    severity: "warning",
    source: "manual",
    type: SIGNAL_TYPES.note,
    url: "https://example.com/docs",
    ...overrides,
  };
}

describe("emitSignal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.signal.create.mockResolvedValue({ id: "signal_1", publicId: "sig_generated" });
  });

  it("creates a Signal row with a sig-prefixed public id", async () => {
    await expect(emitSignal(signalInput())).resolves.toMatchObject({
      publicId: "sig_generated",
    });

    expect(mocks.makePublicId).toHaveBeenCalledWith("sig");
    expect(mocks.prisma.signal.create).toHaveBeenCalledWith({
      data: {
        createdById: "user_1",
        happenedAt,
        keywordId: "keyword_1",
        payload: { note: "manual context" },
        projectId: "project_1",
        publicId: "sig_generated",
        severity: "warning",
        source: "manual",
        type: SIGNAL_TYPES.note,
        url: "https://example.com/docs",
      },
    });
  });

  it("honors a passed transaction client", async () => {
    const tx = {
      signal: { create: vi.fn().mockResolvedValue({ id: "signal_tx" }) },
    } as unknown as PrismaClientLike;

    await emitSignal(signalInput({ severity: undefined }), tx);

    expect(tx.signal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: "sig_generated",
        severity: undefined,
      }),
    });
    expect(mocks.prisma.signal.create).not.toHaveBeenCalled();
  });
});

describe("emitSignalSafe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("swallows and logs emit failures", async () => {
    const error = new Error("database unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.signal.create.mockRejectedValue(error);

    await expect(emitSignalSafe(signalInput())).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith("[signals] emit failed", {
      error,
      projectId: "project_1",
      type: SIGNAL_TYPES.note,
    });
    consoleError.mockRestore();
  });
});
