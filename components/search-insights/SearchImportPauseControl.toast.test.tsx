import { ToastProvider } from "@/components/ui/Toast";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchImportPauseControl } from "./SearchImportPauseControl";

describe("SearchImportPauseControl toast presentation", () => {
  it("renders pause failures with the canonical error glyph", async () => {
    const action = vi.fn(async () => ({
      message: "Search data sync could not be paused. Refresh the page and try again.",
      ok: false as const,
    }));
    render(
      <ToastProvider>
        <SearchImportPauseControl action={action} intent="pause" projectId="prj_1" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause Search Console import" }));

    await waitFor(() => {
      const output = screen.getByText(/could not be paused/).closest("output");
      expect(output).toHaveAttribute("data-toast-severity", "error");
      expect(output?.querySelector('[data-toast-icon="XCircleIcon"]')).toBeInTheDocument();
    });
  });
});
