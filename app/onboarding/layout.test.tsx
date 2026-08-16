import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  firstRunGate: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/components/onboarding/OnboardingLogoutButton", () => ({
  OnboardingLogoutButton: () => <span data-testid="logout-button">Log out</span>,
}));
vi.mock("@/components/ui", () => ({
  BrandLockup: () => <span data-testid="brand-lockup">bisibility</span>,
  ThemeSegments: ({ size }: { size?: "sm" | "md" }) => (
    <span data-size={size} data-testid="theme-segments" />
  ),
}));
vi.mock("@/components/shell/types", () => ({
  shellUserEmail: (user: { email: string }) => user.email,
}));
vi.mock("@/lib/avatar/initials", () => ({
  initials: () => "A",
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
    mocks.requireSession.mockResolvedValue({ user: { email: "admin@example.com", id: "user_1" } });
  });

  it("renders onboarding after setup is complete", async () => {
    const result = await OnboardingLayout({ children: <div>Onboarding content</div> });

    expect(renderToStaticMarkup(result)).toContain("Onboarding content");
    expect(mocks.firstRunGate).toHaveBeenCalledOnce();
  });

  it("places the theme switch in a content-column footer after the signed-in header", async () => {
    const result = await OnboardingLayout({ children: <div>Onboarding content</div> });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain("w-full max-w-[940px] flex-1 flex-col");
    expect(markup).toContain('aria-hidden="true" class="h-4 w-px bg-border-strong"');
    expect(markup).not.toContain("·");
    expect(markup).toMatch(/admin@example\.com[\s\S]*Not you\?[\s\S]*data-testid="logout-button"/);
    expect(markup).toMatch(
      /<footer[^>]*border-border border-t[^>]*>[\s\S]*© 2026 bisibility[\s\S]*data-size="sm"[\s\S]*data-testid="theme-segments"[\s\S]*<\/footer>/,
    );
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
