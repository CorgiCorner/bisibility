import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArchiveMarketDialog } from "./ArchiveMarketDialog";
import { RestoreMarketDialog } from "./RestoreMarketDialog";

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    loading: _loading,
    ...props
  }: React.ComponentProps<"button"> & { loading?: boolean }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/Modal", () => ({
  Modal: ({
    children,
    footer,
    open,
    title,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    open: boolean;
    title: React.ReactNode;
  }) =>
    open ? (
      <section aria-label={String(title)} role="dialog">
        <h2>{title}</h2>
        {children}
        {footer}
      </section>
    ) : null,
}));

const market = {
  activeKeywordCount: 186,
  canonicalKey: "ES@es",
  countryCode: "ES",
  currentVisibility: null,
  displayName: "Malaga",
  futureKeywordDevices: ["desktop", "mobile"] as ("desktop" | "mobile")[],
  id: "pmkt_abcdefghijklmnopqrstuvwx",
  keywordCount: 186,
  languageLabel: "Spanish",
  locationId: "location_malaga",
  monthlyCostCents: 515,
  name: "Malaga core",
  status: "active" as const,
  topThreeCount: null,
};

describe("market lifecycle dialogs", () => {
  it("uses the exact archive confirmation copy and cancel leaves the market untouched", () => {
    const onArchive = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(<ArchiveMarketDialog market={market} onArchive={onArchive} onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "Archive Malaga core?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Malaga core will be archived. Tracking for 186 keywords will stop. Existing rank history stays readable.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive market" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("uses the exact restore cost copy and closes after a confirmed restore", async () => {
    const onClose = vi.fn();
    const onRestore = vi.fn(async () => undefined);
    render(<RestoreMarketDialog market={market} onClose={onClose} onRestore={onRestore} />);

    expect(screen.getByRole("heading", { name: "Restore Malaga core?" })).toBeInTheDocument();
    expect(
      screen.getByText("Restoring resumes 186 keywords on their schedules - approx $5.15 a month."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore market" }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(market));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
