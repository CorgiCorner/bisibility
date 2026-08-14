import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOnboardingProject, deriveOnboardingWebsite, saveOnboardingMarkets } from "./actions";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createProject: vi.fn(),
  getActionActor: vi.fn(),
  hashApiKey: vi.fn(() => "hashed_key"),
  parseActionInput: vi.fn((schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  ),
  prisma: {
    apiKey: { create: vi.fn() },
  },
  revalidatePath: vi.fn(),
  revalidateSettingsViews: vi.fn(),
  requireProjectScope: vi.fn(),
  reconcileProjectMarkets: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: mocks.parseActionInput,
  requireProjectScope: mocks.requireProjectScope,
  revalidateSettingsViews: mocks.revalidateSettingsViews,
}));
vi.mock("@/lib/actions/project", () => ({ createProject: mocks.createProject }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/actions/project-markets", () => ({
  reconcileProjectMarkets: mocks.reconcileProjectMarkets,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/crypto", () => ({ hashApiKey: mocks.hashApiKey }));
vi.mock("server-only", () => ({}));

describe("onboarding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.createProject.mockResolvedValue({
      domain: "example.com",
      id: "project_internal_1",
      name: "Example",
      publicId: "prj_public_1",
      trackingScope: "city",
    });
    mocks.prisma.apiKey.create.mockResolvedValue({
      id: "key_1",
      name: "Development",
      prefix: "bsb_key_test_prefix",
    });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_internal_1", publicId: "prj_1" });
    mocks.reconcileProjectMarkets.mockResolvedValue({ marketIds: [], removedMarketIds: [] });
  });

  it("derives a normalized domain and project name before creation", async () => {
    const input = { website: "https://www.example.co.uk/products?source=onboarding" };

    await expect(createOnboardingProject(input)).resolves.toMatchObject({
      publicId: "prj_public_1",
      timezone: "UTC",
    });

    expect(mocks.createProject).toHaveBeenCalledWith({
      domain: "example.co.uk",
      name: "example",
      defaults: { frequency: "daily", timezone: "UTC" },
    });
    expect(mocks.prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("passes a valid browser timezone through to daily defaults", async () => {
    const input = {
      website: "https://www.example.com",
      timezone: "Europe/Madrid",
    };

    await expect(createOnboardingProject(input)).resolves.toMatchObject({
      timezone: "Europe/Madrid",
    });

    expect(mocks.createProject).toHaveBeenCalledWith({
      domain: "example.com",
      name: "example",
      defaults: { frequency: "daily", timezone: "Europe/Madrid" },
    });
  });

  it("normalizes garbage and absent timezone input to UTC", async () => {
    await createOnboardingProject({ website: "https://www.example.com", timezone: "warsaw" });
    expect(mocks.createProject).toHaveBeenLastCalledWith({
      domain: "example.com",
      name: "example",
      defaults: { frequency: "daily", timezone: "UTC" },
    });

    await createOnboardingProject({ website: "https://www.example.com", timezone: 42 });
    expect(mocks.createProject).toHaveBeenLastCalledWith({
      domain: "example.com",
      name: "example",
      defaults: { frequency: "daily", timezone: "UTC" },
    });
  });

  it("anchors the created daily schedule in the captured timezone", async () => {
    await createOnboardingProject({
      website: "https://www.example.com",
      timezone: "Europe/Madrid",
    });
    const call = mocks.createProject.mock.calls.at(-1)?.[0] as {
      defaults: { frequency: string; timezone: string };
    };
    // A daily schedule whose wall-clock anchor is captured in Europe/Madrid lands
    // at a different absolute instant than the same shape anchored in UTC when a
    // Madrid DST transition falls inside the 24-hour window.
    const from = new Date("2026-03-28T10:00:00.000Z");
    const madridNext = computeNextCheckAt(
      { frequency: "daily", timezone: call.defaults.timezone },
      from,
    );
    const utcNext = computeNextCheckAt({ frequency: "daily", timezone: "UTC" }, from);

    expect(call.defaults.timezone).toBe("Europe/Madrid");
    expect(madridNext).toBeInstanceOf(Date);
    expect(madridNext?.getTime()).not.toBe(utcNext?.getTime());
  });

  it("authorizes preview derivation without creating a project", async () => {
    await expect(deriveOnboardingWebsite({ website: "www.example.com/about" })).resolves.toEqual({
      domain: "example.com",
      name: "example",
    });

    expect(mocks.getActionActor).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith({ id: "user_1" }, "create", {
      ownerId: "user_1",
      requiredRole: "member",
      type: "project",
    });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("persists selected market pairs and rejects more than the onboarding maximum", async () => {
    await expect(
      saveOnboardingMarkets({ marketKeys: ["ES", "ES@en"], projectId: "prj_1" }),
    ).resolves.toEqual({ marketKeys: ["ES", "ES@en"] });

    expect(mocks.reconcileProjectMarkets).toHaveBeenCalledWith({
      choices: [
        expect.objectContaining({ canonicalKey: "ES", kind: "country", languageCode: "es" }),
        expect.objectContaining({ canonicalKey: "ES@en", languageCode: "en" }),
      ],
      projectId: "prj_1",
    });

    await expect(
      saveOnboardingMarkets({
        marketKeys: ["US", "ES", "DE", "FR", "IT", "PL"],
        projectId: "prj_1",
      }),
    ).rejects.toThrow();
    expect(mocks.reconcileProjectMarkets).toHaveBeenCalledTimes(1);
  });
});
