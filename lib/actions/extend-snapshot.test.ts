import { beforeEach, describe, expect, it, vi } from "vitest";
import { extendSerpSnapshot } from "./extend-snapshot";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  extend: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/serp/extend-snapshot", () => ({ extendSnapshot: mocks.extend }));
vi.mock("./_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
  revalidateRankCheckViews: mocks.revalidate,
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
}));
const input = {
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  checkId: "check_abcdefghijklmnopqrstuvwx",
  nextStart: 20,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "actor" });
  mocks.scope.mockResolvedValue({ id: "internal_project" });
  mocks.extend.mockResolvedValue({ ok: true });
});
describe("snapshot extension authorization", () => {
  it("requires keyword update access and resolves project scope before provider work", async () => {
    expect(await extendSerpSnapshot(input)).toEqual({ ok: true });
    expect(mocks.scope).toHaveBeenCalledWith({ id: "actor" }, "update", input.projectId, {
      type: "keyword",
    });
    expect(mocks.extend).toHaveBeenCalledWith({
      ...input,
      projectId: "internal_project",
      actorId: "actor",
    });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });
  it("does not dispatch for a viewer or another project's member", async () => {
    mocks.scope.mockRejectedValue(new Error("forbidden"));
    await expect(extendSerpSnapshot(input)).rejects.toThrow("forbidden");
    expect(mocks.extend).not.toHaveBeenCalled();
  });
  it.each([{ nextStart: 0 }, { nextStart: 11 }, { nextStart: 100 }, { checkId: "internal_id" }])(
    "rejects invalid continuation input %j before authentication",
    async (overrides) => {
      await expect(extendSerpSnapshot({ ...input, ...overrides })).rejects.toThrow();
      expect(mocks.actor).not.toHaveBeenCalled();
      expect(mocks.extend).not.toHaveBeenCalled();
    },
  );
});
