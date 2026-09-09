import { DeploymentModeProvider } from "@/components/shell/DeploymentModeProvider";
import { dateFromFrozenNow, isoFromFrozenNow } from "@/tests/clock";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveMigrationToken, IssuedMigrationToken } from "./cloud-token";
import { MigrationTokenCard, type MigrationTokenStatus } from "./MigrationTokenCard";

vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const writeText = vi.fn();

const activeToken: ActiveMigrationToken = {
  createdAt: isoFromFrozenNow({ hours: 13 }),
  createdBy: { email: "owner@example.com", name: "Owner" },
  expiresAt: isoFromFrozenNow({ hours: 14 }),
  id: "ferry_abcdefghijklmnopqrstuvwx",
  scope: "full",
  singleUse: true,
};

const issuedToken: IssuedMigrationToken = {
  createdAt: isoFromFrozenNow({ hours: 13 }),
  expiresAt: isoFromFrozenNow({ hours: 14 }),
  id: "ferry_bbcdefghijklmnopqrstuvwx",
  importJob: {
    counts: null,
    createdAt: null,
    error: null,
    finishedAt: null,
    id: "imp_abcdefghijklmnopqrstuvwx",
    progress: 0,
    startedAt: null,
    state: "idle",
  },
  scope: "keywords",
  singleUse: false,
  token: "mig_secret_token",
};

function renderCard(
  status: MigrationTokenStatus,
  overrides: Partial<Parameters<typeof MigrationTokenCard>[0]> = {},
) {
  const handlers = {
    onGenerate: vi.fn(),
    onRegenerate: vi.fn(),
    onRevoke: vi.fn(),
  };
  render(
    <MigrationTokenCard
      activeToken={null}
      errorMessage={null}
      issuedToken={null}
      status={status}
      workspaceName="SEO Project"
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("MigrationTokenCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(dateFromFrozenNow({ hours: 13, minutes: 30 }));
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => vi.useRealTimers());

  it("offers token creation when no token exists", () => {
    const handlers = renderCard("none", { pendingAction: "create" });

    expect(screen.getByText("No active token")).toBeInTheDocument();
    expect(
      screen.getByText(
        /shown once, expires in 60 minutes, and is consumed after a successful import/i,
      ),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Creating token" });
    fireEvent.click(button);
    expect(handlers.onGenerate).toHaveBeenCalledOnce();
  });

  it("renders the security note as a full-width card footer", () => {
    const note = "The token grants import access to this project only.";
    renderCard("none", { tokenSecurityNote: note });

    const button = screen.getByRole("button", { name: "Create migration token" });
    const noteEl = screen.getByText(note);
    expect(button.compareDocumentPosition(noteEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(noteEl.parentElement).toHaveClass("border-t", "bg-bg-sunken");
  });

  it("confirms token revoke in a modal", () => {
    const handlers = renderCard("active", { activeToken });

    expect(screen.getByText("Active token exists")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke token" }));
    expect(handlers.onRevoke).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Revoke migration token" });
    expect(
      within(dialog).getByText(
        "This invalidates the current token. Any transfer using it will no longer work.",
      ),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke token" }));
    expect(handlers.onRevoke).toHaveBeenCalledOnce();
  });

  it("confirms token roll in a modal", () => {
    const handlers = renderCard("active", { activeToken });

    expect(
      screen.getByText("Its value is hidden. Roll the token if you need to copy one."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Roll token" }));
    expect(handlers.onRegenerate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Roll token" });
    expect(
      within(dialog).getByText(
        "This invalidates the current token. Any transfer using it will no longer work.",
      ),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Roll token" }));
    expect(handlers.onRegenerate).toHaveBeenCalledOnce();
  });

  it("shows transfer details for an issued token", async () => {
    writeText.mockResolvedValue(undefined);
    renderCard("created", {
      destinationUrl: "https://seo.example.com",
      issuedToken: { ...issuedToken, scope: "full", singleUse: true },
    });

    expect(screen.getByText("Token created")).toBeInTheDocument();
    expect(
      screen.getByText(/cannot be shown again after you refresh or leave this page/i),
    ).toBeInTheDocument();
    expect(screen.getByText("https://seo.example.com")).toBeInTheDocument();
    expect(screen.getByText("mig_secret_token")).toBeInTheDocument();
    expect(screen.getByText("Full project")).toBeInTheDocument();
    expect(screen.getByText("30 minutes remaining · single use")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Migration token" }));
    });
    expect(writeText).toHaveBeenCalledWith("mig_secret_token");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Destination URL" }));
    });
    expect(writeText).toHaveBeenCalledWith("https://seo.example.com");
  });

  it("renders pending revoke and regenerate labels", () => {
    const { rerender } = render(
      <MigrationTokenCard
        activeToken={activeToken}
        errorMessage={null}
        issuedToken={null}
        onGenerate={vi.fn()}
        onRegenerate={vi.fn()}
        onRevoke={vi.fn()}
        pendingAction="revoke"
        status="active"
        workspaceName="SEO Project"
      />,
    );
    expect(screen.getByRole("button", { name: "Revoking" })).toHaveAttribute("aria-busy", "true");

    rerender(
      <MigrationTokenCard
        activeToken={activeToken}
        errorMessage={null}
        issuedToken={null}
        onGenerate={vi.fn()}
        onRegenerate={vi.fn()}
        onRevoke={vi.fn()}
        pendingAction="regenerate"
        status="active"
        workspaceName="SEO Project"
      />,
    );
    expect(screen.getByRole("button", { name: "Rolling token" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("shows the Quick Tunnel hint next to a created loopback destination URL", () => {
    render(
      <DeploymentModeProvider deploymentMode="self-host">
        <MigrationTokenCard
          activeToken={null}
          destinationUrl="http://localhost:3000"
          errorMessage={null}
          issuedToken={issuedToken}
          onGenerate={vi.fn()}
          onRegenerate={vi.fn()}
          onRevoke={vi.fn()}
          status="created"
          workspaceName="SEO Project"
        />
      </DeploymentModeProvider>,
    );

    expect(screen.getByText("http://localhost:3000")).toBeInTheDocument();
    expect(screen.getByText("Running locally?")).toBeInTheDocument();
    expect(
      screen.getByText(/Use the generated HTTPS URL as the Destination URL on the source/),
    ).toBeInTheDocument();
  });

  it("shows a Quick Tunnel hint for a self-hosted loopback destination URL", () => {
    render(
      <DeploymentModeProvider deploymentMode="self-host">
        <MigrationTokenCard
          activeToken={null}
          destinationUrl="http://localhost:3000"
          errorMessage={null}
          issuedToken={null}
          onGenerate={vi.fn()}
          onRegenerate={vi.fn()}
          onRevoke={vi.fn()}
          status="none"
          workspaceName="SEO Project"
        />
      </DeploymentModeProvider>,
    );

    expect(screen.getByText("Running locally?")).toBeInTheDocument();
    expect(screen.getByText("cloudflared tunnel --url http://localhost:3000")).toBeInTheDocument();
    expect(
      screen.getByText(/Use the generated HTTPS URL as the Destination URL on the source/),
    ).toBeInTheDocument();
  });

  it("shows action errors and permits retry", () => {
    const handlers = renderCard("error", {
      errorMessage: "Token service unavailable",
      errorTitle: "Couldn't revoke token",
      pendingAction: null,
      tokenSecurityNote: "The token grants import access to this project only.",
    });

    expect(screen.getByText("Token service unavailable")).toBeInTheDocument();
    expect(screen.getByText("Couldn't revoke token")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(handlers.onGenerate).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("The token grants import access to this project only."),
    ).not.toBeInTheDocument();
  });
});
