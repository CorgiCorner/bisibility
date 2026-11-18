import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  credits: vi.fn(),
  stored: vi.fn(),
  credential: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/audit", () => ({ requiredPublicAuditId: vi.fn(), writeAudit: vi.fn() }));
vi.mock("./access", () => ({
  AssistantRequestError: class extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
    ) {
      super(code);
    }
  },
  assistantProject: vi.fn(),
}));
vi.mock("./project-model-credential", () => ({ readProjectModelCredential: async () => null }));
vi.mock("./funding-extension", () => ({
  assistantCreditsEnabled: () => true,
  creditsFundingOption: mocks.credits,
}));

import { resolveTurnFunding } from "./funding-preference";

const model = {
  id: "model",
  provider: "openai" as const,
  providerModel: "test",
  label: "Test",
  toolUse: true,
  maxOutputTokens: 1,
  contextChars: 100,
  pricing: {
    version: "v",
    inputMicroUsdPerMTok: 1,
    cachedInputMicroUsdPerMTok: 1,
    cacheWriteMicroUsdPerMTok: 1,
    outputMicroUsdPerMTok: 1,
  },
};
const tx = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  projectAiFundingPreference: { findUnique: mocks.stored },
  assistantCredential: { findUnique: mocks.credential },
} as never;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.stored.mockResolvedValue({ mode: "credits" });
  mocks.credential.mockResolvedValue(null);
  mocks.credits.mockResolvedValue({
    mode: "credits",
    provider: "openai",
    available: true,
    reason: null,
    usage: null,
    credential: null,
  });
});

test.each(["viewer", "auditor"] as const)(
  "a %s cannot start a paid Credits turn and gets a clear reason",
  async (role) => {
    await expect(
      resolveTurnFunding(tx, "user", { id: "project", ownerId: "owner", role }, model, [model]),
    ).rejects.toMatchObject({ code: "permission_denied", status: 403 });
    expect(mocks.credits).not.toHaveBeenCalled();
  },
);

test("a member keeps Credits funding", async () => {
  const funding = await resolveTurnFunding(
    tx,
    "user",
    { id: "project", ownerId: "owner", role: "member" },
    model,
    [model],
  );
  expect(funding.choice.mode).toBe("credits");
  expect(mocks.credits).toHaveBeenCalledTimes(1);
});
