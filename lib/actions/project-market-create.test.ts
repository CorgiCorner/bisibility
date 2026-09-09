import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectMarket } from "./project-market-create";

const mocks = vi.hoisted(() => ({
  createProjectMarket: vi.fn(),
  getActionActor: vi.fn(),
  revalidatePath: vi.fn(),
  requireProjectScope: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/markets/create", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/markets/create")>()),
  createProjectMarket: mocks.createProjectMarket,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const projectId = `prj_${"a".repeat(24)}`;
const created = {
  canonicalKey: "ES",
  countryCode: "ES",
  displayName: "All of Spain",
  keywordCount: 0,
  kind: "country" as const,
  languageCode: "es",
  languageLabel: "Spanish",
  publicId: `pmkt_${"b".repeat(24)}`,
};

function input() {
  return {
    canonicalKey: "ES",
    countryCode: "ES",
    devices: ["desktop"],
    kind: "country",
    languageCode: "es",
    method: { kind: "empty" },
    name: "Spain search",
    projectId,
  };
}

describe("create project market action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.createProjectMarket.mockResolvedValue(created);
  });

  it("authorizes project creation before the service can read or write", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("Authentication required."));

    await expect(createProjectMarket(input())).rejects.toThrow("Authentication required.");

    expect(mocks.createProjectMarket).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("passes the authorized project's internal id and only validated input to the service, then refreshes Markets", async () => {
    await expect(createProjectMarket(input())).resolves.toMatchObject({ keywordCount: 0 });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "create", projectId, {
      type: "project_market",
    });
    expect(mocks.createProjectMarket).toHaveBeenCalledWith("user_1", "project_1", input());
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/app/${projectId}/markets`);
  });

  it("rejects a database location id in place of the canonical key before authorization", async () => {
    const { canonicalKey: _canonicalKey, ...withLocationId } = { ...input(), locationId: "loc_1" };

    await expect(createProjectMarket(withLocationId)).rejects.toThrow();

    expect(mocks.getActionActor).not.toHaveBeenCalled();
    expect(mocks.createProjectMarket).not.toHaveBeenCalled();
  });

  it("forwards the market's location identity to the caller unchanged", async () => {
    await expect(createProjectMarket(input())).resolves.toEqual(created);
  });

  it("rejects client-supplied keyword identifiers before authorization or writes", async () => {
    await expect(
      createProjectMarket({ ...input(), keywordIds: ["kw_untrusted"] }),
    ).rejects.toThrow();

    expect(mocks.getActionActor).not.toHaveBeenCalled();
    expect(mocks.createProjectMarket).not.toHaveBeenCalled();
  });
});
