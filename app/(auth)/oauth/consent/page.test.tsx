import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/OAuthConsentForm", () => ({
  OAuthConsentForm: () => <div>Consent form</div>,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import OAuthConsentPage from "./page";

describe("OAuth consent page", () => {
  it("points CLI users to the actual personal-token revocation surface", async () => {
    const markup = renderToStaticMarkup(
      await OAuthConsentPage({
        searchParams: Promise.resolve({
          client_id: "bisibility-cli",
          scope: "openid tokens:write",
        }),
      }),
    );

    expect(markup).toContain("The CLI stores a personal access token after approval.");
    expect(markup).toContain("Account -&gt; Security");
    expect(markup).not.toContain("removing the client");
    expect(markup).not.toContain("workspace settings");
  });
});
