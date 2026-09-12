import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountView: vi.fn(),
  getPreferences: vi.fn(),
  headers: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@/components/account/AccountShell", () => ({
  AccountShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/account/PreferencesForm", () => ({
  PreferencesForm: () => <div data-testid="preferences-form" />,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/demo/account-view", () => ({ resolveDemoAccountView: mocks.accountView }));
vi.mock("@/lib/queries/account", () => ({ getPreferences: mocks.getPreferences }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("./actions", () => ({ updatePreferences: vi.fn() }));

import PreferencesPage from "./page";

describe("PreferencesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accountView.mockResolvedValue("normal");
    mocks.getPreferences.mockResolvedValue({ dateFormat: "auto" });
    mocks.headers.mockResolvedValue({ get: vi.fn(() => "en-US") });
    mocks.requireSession.mockResolvedValue({ user: { id: "owner_1" } });
  });

  it("stops an editable Viewer before loading preferences", async () => {
    mocks.requireSession.mockResolvedValue({ user: { id: "viewer_1" } });
    mocks.accountView.mockResolvedValue("locked");

    render(await PreferencesPage());

    expect(screen.getByRole("heading", { name: "Demo account" })).toBeVisible();
    expect(mocks.getPreferences).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it("keeps the normal preferences screen for a revalidated Owner", async () => {
    render(await PreferencesPage());

    expect(mocks.accountView).toHaveBeenCalledWith("owner_1");
    expect(mocks.getPreferences).toHaveBeenCalledOnce();
    expect(screen.getByTestId("preferences-form")).toBeVisible();
  });
});
