import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthConsentForm } from "./OAuthConsentForm";

const mocks = vi.hoisted(() => ({
  consent: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    oauth2: { consent: mocks.consent },
  },
}));

describe("OAuthConsentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables consent when the client identifier is missing and supplies the default scope", () => {
    render(<OAuthConsentForm clientId="" scopes={[]} />);

    expect(screen.getByText("Unknown client")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
  });

  it("accepts a signed-query request without a legacy consent code", async () => {
    mocks.consent.mockResolvedValue({ data: {}, error: null });
    render(<OAuthConsentForm clientId="client_1" scopes={["email"]} />);

    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(
      await screen.findByText("Consent response did not include a redirect URI."),
    ).toBeInTheDocument();
    expect(mocks.consent).toHaveBeenCalledWith({ accept: true });
  });

  it("explains the CLI token-creation scope", () => {
    render(<OAuthConsentForm clientId="bisibility-cli" scopes={["tokens:write"]} />);

    expect(screen.getByText("Create a personal access token for this client")).toBeInTheDocument();
  });

  it("posts denial and maps provider and network failures", async () => {
    mocks.consent.mockResolvedValueOnce({
      data: null,
      error: { error_description: "Consent expired" },
    });
    const view = render(<OAuthConsentForm clientId="client_1" scopes={["profile"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(await screen.findByText("Consent expired")).toBeInTheDocument();

    mocks.consent.mockRejectedValueOnce(new Error("Network unavailable"));
    view.rerender(<OAuthConsentForm clientId="client_1" scopes={["custom"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
  });

  it("rejects unsafe redirect schemes", async () => {
    mocks.consent.mockResolvedValue({
      data: { redirect: true, url: "javascript:alert(1)" },
      error: null,
    });
    render(<OAuthConsentForm clientId="client_1" scopes={["openid"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(
      await screen.findByText("Consent response returned an unsupported redirect URI."),
    ).toBeInTheDocument();
  });

  it("prefers the API message field for consent failures", async () => {
    mocks.consent.mockResolvedValue({
      data: null,
      error: { message: "Consent request rejected" },
    });
    render(<OAuthConsentForm clientId="client_1" scopes={["openid"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Consent request rejected")).toBeInTheDocument();
  });

  it("falls back when the client error has no message", async () => {
    mocks.consent.mockResolvedValue({ data: null, error: {} });
    render(<OAuthConsentForm clientId="client_1" scopes={["openid"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Could not complete the consent request.")).toBeInTheDocument();
  });
});
