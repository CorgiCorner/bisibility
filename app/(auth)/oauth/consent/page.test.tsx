import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOAuthConsentClient: vi.fn(),
  props: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/components/auth/OAuthConsentForm", () => ({
  OAuthConsentForm: (props: unknown) => {
    mocks.props(props);
    return <div>Consent form</div>;
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/queries/oauth-consent", () => ({
  getOAuthConsentClient: mocks.getOAuthConsentClient,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import OAuthConsentPage from "./page";

describe("OAuth consent page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({
      user: { email: "owner@example.com", id: "user_1", name: "Owner Example" },
    });
    mocks.getOAuthConsentClient.mockResolvedValue({
      dynamic: true,
      id: "client_1",
      name: "Codex",
      redirectUri: "127.0.0.1:51008/callback/request",
    });
  });

  it("hydrates the review card with account and verified OAuth request details", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_785_456_300_000);
    const markup = renderToStaticMarkup(
      await OAuthConsentPage({
        searchParams: Promise.resolve({
          client_id: "client_1",
          exp: "1785456600",
          redirect_uri: "http://127.0.0.1:51008/callback/request",
          scope: "openid profile email offline_access read write admin tokens:write",
        }),
      }),
    );

    expect(mocks.requireSession).toHaveBeenCalledOnce();
    expect(mocks.getOAuthConsentClient).toHaveBeenCalledWith(
      "client_1",
      "http://127.0.0.1:51008/callback/request",
    );
    expect(mocks.props).toHaveBeenCalledWith({
      account: {
        avatarUrl: expect.stringMatching(
          /^https:\/\/www\.gravatar\.com\/avatar\/[0-9a-f]{64}\?d=404&s=52$/,
        ),
        email: "owner@example.com",
        initials: "OE",
      },
      client: {
        dynamic: true,
        id: "client_1",
        name: "Codex",
        redirectUri: "127.0.0.1:51008/callback/request",
      },
      expiresAt: 1785456600000,
      scopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "read",
        "write",
        "admin",
        "tokens:write",
      ],
    });
    expect(markup).toContain("Review agent access.");
    expect(markup).toContain("PKCE S256");
    expect(markup).not.toContain("codex mcp login bisibility");
  });

  it("uses first-party CLI consent copy for the stable client id", async () => {
    mocks.getOAuthConsentClient.mockResolvedValue({
      dynamic: false,
      id: "bisibility-cli",
      name: "Bisibility CLI",
      redirectUri: "127.0.0.1:8976/callback",
    });

    const markup = renderToStaticMarkup(
      await OAuthConsentPage({
        searchParams: Promise.resolve({
          client_id: "bisibility-cli",
          scope: "openid tokens:write",
        }),
      }),
    );

    expect(markup).toContain("Sign in to Bisibility CLI");
    expect(markup).not.toContain("Review agent access.");
  });

  it("uses a short fallback expiry only when the signed request omits one", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    renderToStaticMarkup(
      await OAuthConsentPage({
        searchParams: Promise.resolve({ client_id: "client_1", scope: "openid" }),
      }),
    );

    expect(mocks.props).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: 1_300_000 }));
  });
});
