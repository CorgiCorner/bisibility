import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOnboardingProject } from "./actions";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getActionActor: vi.fn(),
  hashApiKey: vi.fn(() => "hashed_key"),
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
  parseActionInput: vi.fn(),
  requireProjectScope: vi.fn(),
  revalidateSettingsViews: mocks.revalidateSettingsViews,
}));
vi.mock("@/lib/actions/project", () => ({ createProject: mocks.createProject }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/crypto", () => ({ hashApiKey: mocks.hashApiKey }));

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

  it("returns the created workspace so the wizard can save scope and continue", async () => {
    const input = { domain: "example.com", name: "Example", trackingScope: "city" as const };

    await expect(createOnboardingProject(input)).resolves.toMatchObject({
      publicId: "prj_public_1",
    });

    expect(mocks.createProject).toHaveBeenCalledWith(input);
    expect(mocks.prisma.apiKey.create).not.toHaveBeenCalled();
  });
});
