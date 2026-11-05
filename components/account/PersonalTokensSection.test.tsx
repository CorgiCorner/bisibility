import { renderWithAccountMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalTokensSection } from "./PersonalTokensSection";

describe("PersonalTokensSection", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("formats project-less token dates in the viewer browser timezone", () => {
    process.env.TZ = "America/New_York";

    render(
      <PersonalTokensSection
        dateFormat="long"
        issueToken={vi.fn()}
        revokeToken={vi.fn()}
        tokens={[
          {
            createdAt: "2026-06-20T01:30:00.000Z",
            expiresAt: null,
            id: "pat_abcdefghijklmnopqrstuvwx",
            lastUsedAt: null,
            maskedValue: "bsb_pat_live_******",
            name: "Automation",
            scope: "read",
          },
        ]}
      />,
    );

    expect(screen.getByText(/created Jun 19, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/never used/)).toBeInTheDocument();
    expect(screen.getByText(/never expires/)).toBeInTheDocument();
  });
});
