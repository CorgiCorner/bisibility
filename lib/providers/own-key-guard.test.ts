import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  required: vi.fn(),
  stored: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { project: { findUnique: mocks.project } } }));
vi.mock("./own-key-policy-extension", () => ({ ownProviderKeysRequired: mocks.required }));
vi.mock("./stored-credentials", () => ({ storedProviderCredentialsPresent: mocks.stored }));

import { OwnProviderKeyRequiredError } from "./execution-extension-errors";
import { assertOwnKeyStored } from "./own-key-guard";

const request = {
  capability: "rank_check",
  credentialsEncrypted: null,
  projectId: "project_1",
  provider: "serpapi",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockResolvedValue({ ownerId: "owner_1" });
});

describe("assertOwnKeyStored", () => {
  it("allows a stored own key without reading the account policy", async () => {
    mocks.stored.mockReturnValue(true);
    await expect(assertOwnKeyStored(request)).resolves.toBeUndefined();
    expect(mocks.required).not.toHaveBeenCalled();
  });

  it("keeps the environment fallback for an unflagged account", async () => {
    mocks.stored.mockReturnValue(false);
    mocks.required.mockResolvedValue(false);
    await expect(assertOwnKeyStored(request)).resolves.toBeUndefined();
    expect(mocks.required).toHaveBeenCalledWith("owner_1");
  });

  it("refuses the environment fallback for an account that must use its own keys", async () => {
    mocks.stored.mockReturnValue(false);
    mocks.required.mockResolvedValue(true);
    const refusal = await assertOwnKeyStored(request).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(OwnProviderKeyRequiredError);
    expect(refusal).toMatchObject({
      capability: "rank_check",
      projectId: "project_1",
      provider: "serpapi",
      message: expect.stringContaining("Connect your own SerpApi key"),
    });
  });
});
