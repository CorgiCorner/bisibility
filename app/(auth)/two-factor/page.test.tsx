import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(),
  twoFactorChallengeForm: vi.fn(),
}));

vi.mock("@/components/auth/TwoFactorChallengeForm", () => ({
  TwoFactorChallengeForm: (props: Record<string, unknown>) => {
    mocks.twoFactorChallengeForm(props);
    return null;
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import TwoFactorPage from "./page";

describe("two-factor page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
  });

  it("passes a validated return destination to the challenge form", async () => {
    const returnTo = "/oauth/consent?client_id=client_1&scope=openid";

    renderToStaticMarkup(
      await TwoFactorPage({ searchParams: Promise.resolve({ next: returnTo }) }),
    );

    expect(mocks.twoFactorChallengeForm).toHaveBeenCalledWith({ returnTo });
  });

  it("falls back to the signed-in home for an invalid destination", async () => {
    renderToStaticMarkup(
      await TwoFactorPage({
        searchParams: Promise.resolve({ next: "https://evil.example.com" }),
      }),
    );

    expect(mocks.twoFactorChallengeForm).toHaveBeenCalledWith({ returnTo: "/app" });
  });

  it("redirects an active session to the validated destination", async () => {
    const returnTo = "/oauth/consent?client_id=client_1&scope=openid";
    mocks.getSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`redirect:${destination}`);
    });

    await expect(
      TwoFactorPage({ searchParams: Promise.resolve({ next: returnTo }) }),
    ).rejects.toThrow(`redirect:${returnTo}`);
    expect(mocks.redirect).toHaveBeenCalledWith(returnTo);
    expect(mocks.twoFactorChallengeForm).not.toHaveBeenCalled();
  });
});
