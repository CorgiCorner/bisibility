import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { authFeatureTestMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOAuthConsentClient: vi.fn(),
  props: vi.fn(),
  requireSession: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/components/auth/OAuthConsentForm", () => ({
  OAuthConsentForm: (props: unknown) => {
    mocks.props(props);
    return <div>Consent form</div>;
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("server-only", () => ({}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/lib/queries/oauth-consent", () => ({
  getOAuthConsentClient: mocks.getOAuthConsentClient,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import OAuthConsentPage from "./page";

function renderPage(page: ReactNode) {
  return renderToStaticMarkup(
    <FeatureMessagesProvider locale="en" messages={authFeatureTestMessages} timeZone="UTC">
      {page}
    </FeatureMessagesProvider>,
  );
}

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
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
  });

  it("hydrates the review card with account and verified OAuth request details", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_785_456_300_000);
    const markup = renderPage(
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
    expect(markup).not.toContain("Review agent access.");
    expect(markup).not.toContain("PKCE S256");
    expect(markup).toContain("bisibility");
    expect(markup).not.toContain("codex mcp login bisibility");
  });

  it("passes the first-party CLI identity to the single consent form", async () => {
    mocks.getOAuthConsentClient.mockResolvedValue({
      dynamic: false,
      id: "bisibility-cli",
      name: "Bisibility CLI",
      redirectUri: "127.0.0.1:8976/callback",
    });

    const markup = renderPage(
      await OAuthConsentPage({
        searchParams: Promise.resolve({
          client_id: "bisibility-cli",
          scope: "openid tokens:write",
        }),
      }),
    );

    expect(mocks.props).toHaveBeenCalledWith(
      expect.objectContaining({
        client: expect.objectContaining({ id: "bisibility-cli", name: "Bisibility CLI" }),
      }),
    );
    expect(markup).not.toContain("Review agent access.");
  });

  it("uses a short fallback expiry only when the signed request omits one", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    renderPage(
      await OAuthConsentPage({
        searchParams: Promise.resolve({ client_id: "client_1", scope: "openid" }),
      }),
    );

    expect(mocks.props).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: 1_300_000 }));
  });
});
