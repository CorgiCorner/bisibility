import { deferred } from "@/tests/deferred";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openPalette: vi.fn(),
  showToast: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/components/shell/CommandPalette", () => ({
  useCommandPalette: () => ({ openPalette: mocks.openPalette }),
}));
vi.mock("@/components/ui", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut: mocks.signOut } }));
vi.mock("@mui/material/Divider", () => ({ default: () => null }));
vi.mock("@mui/material/Menu", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./UserMenuRow", () => ({
  UserMenuRow: ({
    disabled,
    item,
    onSelect,
  }: {
    disabled?: boolean;
    item: { label: string };
    onSelect?: () => void;
  }) =>
    onSelect ? (
      <button disabled={disabled} onClick={onSelect} type="button">
        {item.label}
      </button>
    ) : null,
}));

import { UserMenu } from "./UserMenu";

let assignedHref: string | null = null;

function renderMenu() {
  render(
    <UserMenu
      anchorEl={document.createElement("button")}
      email="member@example.com"
      initials="ME"
      name="Member Example"
      onClose={vi.fn()}
      roleLine="Member"
    />,
  );
}

async function clickSignOut() {
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
}

function interceptLocation() {
  assignedHref = null;
  vi.stubGlobal("window", {
    location: {
      set href(href: string) {
        assignedHref = href;
      },
    },
  });
}

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the user informed when sign out fails", async () => {
    const signOut = deferred<unknown>();
    mocks.signOut.mockReturnValue(signOut.promise);
    renderMenu();
    const hrefBefore = window.location.href;

    await clickSignOut();
    signOut.reject(new Error("network"));

    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith("Could not sign out. Please try again.", {
        tint: "red",
      }),
    );
    expect(window.location.href).toBe(hrefBefore);
  });

  it("navigates to sign in on success", async () => {
    const signOut = deferred<unknown>();
    mocks.signOut.mockReturnValue(signOut.promise);
    renderMenu();

    await clickSignOut();
    interceptLocation();
    signOut.resolve({});
    await Promise.resolve();
    await Promise.resolve();

    expect(assignedHref).toBe("/login");
  });
});
