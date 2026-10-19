import { encryptSecret } from "@/lib/providers/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ memberships: vi.fn(), required: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { membership: { findMany: mocks.memberships } },
}));
vi.mock("@/lib/providers/own-key-policy-extension", () => ({
  ownProviderKeysRequired: mocks.required,
}));

import type { PersonalApiContext } from "./context";
import { getMe } from "./me";

const OWN_PROJECT = "prj_a00000000000000000000000";
const SHARED_PROJECT = "prj_b00000000000000000000000";

function connection(provider: string, overrides: Record<string, unknown> = {}) {
  return {
    credentialSource: "own",
    credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "fixture-key" })),
    enabled: true,
    provider,
    status: "connected",
    ...overrides,
  };
}

function context(headers: Record<string, string> = {}) {
  return {
    auth: {
      user: {
        email: "tester@example.com",
        id: "user_1",
        name: "Tester",
        publicId: "usr_a00000000000000000000000",
      },
    },
    headers: new Headers(),
    req: new Request("https://example.com/api/v1/me", { headers }),
  } as unknown as PersonalApiContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.memberships.mockResolvedValue([
    {
      project: {
        domain: "example.com",
        name: "Own",
        ownerId: "user_1",
        providerConnections: [
          connection("serpapi"),
          connection("dataforseo", { credentialSource: "hosted", credentialsEncrypted: null }),
        ],
        publicId: OWN_PROJECT,
      },
      role: "owner",
    },
    {
      project: {
        domain: "example.org",
        name: "Shared",
        ownerId: "owner_2",
        providerConnections: [],
        publicId: SHARED_PROJECT,
      },
      role: "member",
    },
  ]);
});

describe("GET /me provider key mode", () => {
  it("reports the mode and the capabilities missing an own key", async () => {
    mocks.required.mockImplementation(async (userId: string) => userId === "user_1");
    const body = await (await getMe(context())).json();

    expect(body.provider_keys_required).toBe(true);
    const own = body.projects.find((project: { id: string }) => project.id === OWN_PROJECT);
    expect(own.provider_keys_required).toBe(true);
    // The hosted DataForSEO connection does not count; own SerpApi serves rank checks only.
    expect(own.missing_provider_keys).toEqual([
      { capability: "keyword_research", providers: ["dataforseo"] },
      { capability: "backlinks", providers: ["dataforseo"] },
      { capability: "domain_overview", providers: ["dataforseo"] },
      { capability: "ai_tracking", providers: ["dataforseo"] },
    ]);
    const shared = body.projects.find((project: { id: string }) => project.id === SHARED_PROJECT);
    expect(shared).toMatchObject({ provider_keys_required: false, missing_provider_keys: [] });
  });

  it("is false with no missing keys for an unflagged account", async () => {
    mocks.required.mockResolvedValue(false);
    const body = await (await getMe(context())).json();
    expect(body.provider_keys_required).toBe(false);
    for (const project of body.projects) {
      expect(project).toMatchObject({ provider_keys_required: false, missing_provider_keys: [] });
    }
  });

  it.each(["testflight", "production", "app-store", ""])(
    "ignores a client channel header (%s): only the account flag decides",
    async (channel) => {
      mocks.required.mockImplementation(async (userId: string) => userId === "user_1");
      const body = await (await getMe(context({ "X-Bisibility-Channel": channel }))).json();
      expect(body.provider_keys_required).toBe(true);
      expect(mocks.required).toHaveBeenCalledWith("user_1");
      expect(mocks.required.mock.calls.every((call) => call.length === 1)).toBe(true);
    },
  );
});
