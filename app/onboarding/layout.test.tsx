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
  Avatar: ({ initials, src }: { initials: string; src?: string | null }) => (
    <span data-src={src ?? ""} data-testid="onboarding-avatar">
      {initials}
    </span>
  ),
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
vi.mock("@/lib/avatar/gravatar", () => ({
  gravatarUrl: (email: string, size: number) =>
    `https://www.gravatar.com/avatar/test?d=404&s=${size * 2}&e=${email}`,
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

    expect(markup).toContain("flex min-h-dvh flex-col items-center bg-bg px-4 py-[46px] text-fg");
    expect(markup).not.toContain("pb-[120px]");
    expect(markup).toContain("w-full max-w-[940px] flex-1 flex-col");
    expect(markup).toContain('aria-hidden="true" class="h-4 w-px bg-border"');
    expect(markup).not.toContain("·");
    expect(markup).toMatch(/admin@example\.com[\s\S]*Not you\?[\s\S]*data-testid="logout-button"/);
    expect(markup).toContain(
      'data-src="https://www.gravatar.com/avatar/test?d=404&amp;s=44&amp;e=admin@example.com"',
    );
    expect(markup).toContain('data-testid="onboarding-avatar"');
    expect(markup).toContain("mt-auto pt-14");
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
