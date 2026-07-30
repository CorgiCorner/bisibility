import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  firstRunGate: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/components/onboarding/OnboardingLogoutButton", () => ({
  OnboardingLogoutButton: () => null,
}));
vi.mock("@/components/shell/types", () => ({
  shellUserEmail: (user: { email: string }) => user.email,
  shellUserInitials: () => "A",
}));
vi.mock("@/lib/auth/first-run", () => ({
  redirectToSetupIfFirstRun: mocks.firstRunGate,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/seo/noindex", () => ({ createNoindexMetadata: () => ({}) }));

import OnboardingLayout from "./layout";

describe("onboarding setup-first gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.firstRunGate.mockResolvedValue(undefined);
    mocks.requireSession.mockResolvedValue({ user: { email: "admin@example.test", id: "user_1" } });
  });

  it("renders onboarding after setup is complete", async () => {
    const result = await OnboardingLayout({ children: <div>Onboarding content</div> });

    expect(renderToStaticMarkup(result)).toContain("Onboarding content");
    expect(mocks.firstRunGate).toHaveBeenCalledOnce();
  });

  it("redirects to setup before rendering tenant onboarding", async () => {
    mocks.firstRunGate.mockRejectedValue(new Error("NEXT_REDIRECT:/setup"));

    await expect(OnboardingLayout({ children: <div>Hidden</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/setup",
    );

    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("uses normal sign-in after setup when the session is absent or stale", async () => {
    mocks.requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(OnboardingLayout({ children: <div>Hidden</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(mocks.firstRunGate).toHaveBeenCalledOnce();
  });
});
