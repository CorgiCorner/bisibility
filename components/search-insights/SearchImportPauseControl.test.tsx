import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchImportPauseControl } from "./SearchImportPauseControl";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui/toast-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/toast-context")>()),
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe("SearchImportPauseControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toasts a sanitized action result without expanding inline", async () => {
    const message = "Search data sync could not be paused. Refresh the page and try again.";
    const action = vi.fn(async () => ({ message, ok: false as const }));
    render(<SearchImportPauseControl action={action} intent="pause" projectId="prj_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pause Search Console import" }));
    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(message, { severity: "error" }),
    );
    expect(mocks.showToast.mock.calls[0]?.[1]?.severity).toBe("error");
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("refreshes without a redundant success toast", async () => {
    const action = vi.fn(async () => ({ ok: true as const, state: "paused" }));
    render(<SearchImportPauseControl action={action} intent="pause" projectId="prj_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pause Search Console import" }));
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled());
    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});
