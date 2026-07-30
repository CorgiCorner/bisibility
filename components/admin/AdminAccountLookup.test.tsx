import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("@/components/admin/AdminAccountActions", () => ({
  AdminAccountActions: ({ status }: Readonly<{ status: string }>) => (
    <p>Account actions: {status}</p>
  ),
}));
vi.mock("@/lib/actions/instance-admin-account", () => ({
  lookupInstanceAdminAccount: mocks.lookup,
}));

import { AdminAccountLookup } from "./AdminAccountLookup";

describe("AdminAccountLookup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an exact email or user ID through React Hook Form and Zod", async () => {
    render(<AdminAccountLookup />);

    fireEvent.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter an exact email or user ID.");
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(screen.getByText("Lookups are recorded in the admin audit log.")).toBeInTheDocument();
  });

  it("renders only approved metadata for an exact-match hit", async () => {
    const user = userEvent.setup();
    mocks.lookup.mockResolvedValue({
      account: {
        createdAt: "2026-01-02T03:04:05.000Z",
        email: "member@example.com",
        id: "user_123",
        keywordCount: 321,
        lastActiveAt: null,
        monthlySpendCents: 12_345,
        projectCount: 7,
        providerConnectionsByKind: [
          { count: 2, kind: "google_search_console" },
          { count: 1, kind: "dataforseo" },
        ],
        status: "active",
      },
      status: "found",
    });
    render(<AdminAccountLookup />);

    await user.type(screen.getByLabelText("Exact email or user ID"), "  Member@Example.com  ");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() =>
      expect(mocks.lookup).toHaveBeenCalledWith({ identifier: "Member@Example.com" }),
    );
    expect(await screen.findByText("user_123")).toBeInTheDocument();
    expect(screen.getByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByText("321")).toBeInTheDocument();
    expect(screen.getByText("$123.45")).toBeInTheDocument();
    expect(screen.getByText("google_search_console: 2")).toBeInTheDocument();
    expect(screen.getByText("dataforseo: 1")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();

    expect(screen.getByText("Account actions: active")).toBeInTheDocument();
  });

  it("renders honest miss and rate-limit states", async () => {
    const user = userEvent.setup();
    mocks.lookup.mockResolvedValueOnce({
      message: "No account matches this identifier.",
      status: "not_found",
    });
    const { rerender } = render(<AdminAccountLookup />);

    await user.type(screen.getByLabelText("Exact email or user ID"), "user_missing");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("No account matches this identifier.")).toBeInTheDocument();

    rerender(<AdminAccountLookup key="rate-limited" />);
    mocks.lookup.mockResolvedValueOnce({
      message: "Too many account lookups. Try again later.",
      retryAt: "2026-07-18T01:00:00.000Z",
      status: "rate_limited",
    });
    await user.type(screen.getByLabelText("Exact email or user ID"), "user_limited");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many account lookups. Try again later.",
    );
  });
});
