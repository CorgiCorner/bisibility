import { dateFromFrozenNow, isoFromFrozenNow } from "@/tests/clock";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveMigrationToken, IssuedMigrationToken } from "./cloud-token";
import { MigrationTokenCard, type MigrationTokenStatus } from "./MigrationTokenCard";

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
    onCopy: vi.fn(),
    onGenerate: vi.fn(),
    onRegenerate: vi.fn(),
    onRevoke: vi.fn(),
  };
  render(
    <MigrationTokenCard
      activeToken={null}
      copied={false}
      errorMessage={null}
      issuedToken={null}
      status={status}
      workspaceName="SEO Workspace"
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
  });

  afterEach(() => vi.useRealTimers());

  it("offers token creation when no token exists", () => {
    const handlers = renderCard("none", { pendingAction: "create" });

    expect(screen.getByText("No active token")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Creating token" });
    fireEvent.click(button);
    expect(handlers.onGenerate).toHaveBeenCalledOnce();
  });

  it("renders an active token and supports revoke and regeneration", () => {
    const handlers = renderCard("active", { activeToken });

    expect(screen.getByText("Active migration token")).toBeInTheDocument();
    expect(screen.getByText("Created by owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("Expires in 30 min")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke token" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(handlers.onRevoke).toHaveBeenCalledOnce();
    expect(handlers.onRegenerate).toHaveBeenCalledOnce();
  });

  it("shows an issued token once and copies it", () => {
    const handlers = renderCard("created", { copied: true, issuedToken });

    expect(screen.getByText("mig_secret_token")).toBeInTheDocument();
    expect(screen.getByText("Reusable")).toBeInTheDocument();
    expect(screen.getByText("Scope keywords")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(handlers.onCopy).toHaveBeenCalledOnce();
  });

  it("renders pending revoke and regenerate labels", () => {
    const { rerender } = render(
      <MigrationTokenCard
        activeToken={activeToken}
        copied={false}
        errorMessage={null}
        issuedToken={null}
        onCopy={vi.fn()}
        onGenerate={vi.fn()}
        onRegenerate={vi.fn()}
        onRevoke={vi.fn()}
        pendingAction="revoke"
        status="active"
        workspaceName="SEO Workspace"
      />,
    );
    expect(screen.getByRole("button", { name: "Revoking" })).toBeInTheDocument();

    rerender(
      <MigrationTokenCard
        activeToken={activeToken}
        copied={false}
        errorMessage={null}
        issuedToken={null}
        onCopy={vi.fn()}
        onGenerate={vi.fn()}
        onRegenerate={vi.fn()}
        onRevoke={vi.fn()}
        pendingAction="regenerate"
        status="active"
        workspaceName="SEO Workspace"
      />,
    );
    expect(screen.getByRole("button", { name: "Regenerating" })).toBeInTheDocument();
  });

  it("shows action errors and permits retry", () => {
    const handlers = renderCard("error", {
      errorMessage: "Token service unavailable",
      errorTitle: "Couldn't revoke token",
      pendingAction: null,
    });

    expect(screen.getByText("Token service unavailable")).toBeInTheDocument();
    expect(screen.getByText("Couldn't revoke token")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(handlers.onGenerate).toHaveBeenCalledOnce();
  });
});
