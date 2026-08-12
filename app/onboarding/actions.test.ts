import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOnboardingProject, deriveOnboardingWebsite } from "./actions";

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
  writeAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: mocks.parseActionInput,
  requireProjectScope: vi.fn(),
  revalidateSettingsViews: mocks.revalidateSettingsViews,
}));
vi.mock("@/lib/actions/project", () => ({ createProject: mocks.createProject }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
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
  });

  it("derives a normalized domain and project name before creation", async () => {
    const input = { website: "https://www.example.co.uk/products?source=onboarding" };

    await expect(createOnboardingProject(input)).resolves.toMatchObject({
      publicId: "prj_public_1",
    });

    expect(mocks.createProject).toHaveBeenCalledWith({
      domain: "example.co.uk",
      name: "example",
    });
    expect(mocks.prisma.apiKey.create).not.toHaveBeenCalled();
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
});
