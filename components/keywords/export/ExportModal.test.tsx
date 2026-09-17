import type { KeywordExportTarget } from "@/components/keywords/export-target-model";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportModal } from "./ExportModal";

const mocks = vi.hoisted(() => ({ downloadBlob: vi.fn(), exportKeywords: vi.fn() }));

vi.mock("@/lib/actions/keyword-export-action", () => ({ exportKeywords: mocks.exportKeywords }));
vi.mock("@/lib/ui/download", () => ({ downloadBlob: mocks.downloadBlob }));

function target(mode: "all" | "query" | "selected", count: number): KeywordExportTarget {
  if (mode === "all") return { count, selection: { mode } };
  if (mode === "selected") {
    return { count, selection: { keywordIds: ["kw_fixture"], mode } };
  }
  return {
    count,
    selection: {
      mode,
      query: {} as never,
    },
  };
}

function renderModal(mode: "all" | "query" | "selected", count: number) {
  const onClose = vi.fn();
  render(
    <ExportModal onClose={onClose} open projectId="prj_fixture" target={target(mode, count)} />,
  );
  return { onClose };
}

describe("ExportModal", () => {
  it.each([
    ["query", 2, "Export 2 filtered keywords"],
    ["selected", 5, "Export 5 selected keywords"],
  ] as const)("localizes the %s target subtitle with count %i", (mode, count, subtitle) => {
    renderModal(mode, count);

    expect(screen.getByText(subtitle)).toBeInTheDocument();
  });

  it("keeps all-export subtitle count-free when the local page has only one row", () => {
    renderModal("all", 1);

    expect(screen.getByText("Export all keywords")).toBeInTheDocument();
    expect(screen.queryByText("Export all 1 keyword")).not.toBeInTheDocument();
  });

  it("uses the safe localized fallback when export rejects an unknown diagnostic", async () => {
    mocks.exportKeywords.mockRejectedValueOnce(new Error("untrusted upstream diagnostic"));
    renderModal("all", 1);

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() =>
      expect(screen.getByText("Export could not be completed. Try again.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("untrusted upstream diagnostic")).not.toBeInTheDocument();
  });

  it("maps the concrete keyword download limit without exposing its server diagnostic", async () => {
    mocks.exportKeywords.mockRejectedValueOnce(
      new Error("Instance import package downloads currently support up to 500 keywords."),
    );
    renderModal("selected", 5);

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "This export exceeds the current download limit. Reduce the selection and try again.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Instance import package downloads currently support up to 500 keywords."),
    ).not.toBeInTheDocument();
  });

  it("guides a current export into history controls without exposing its server diagnostic", async () => {
    mocks.exportKeywords.mockRejectedValueOnce(
      new Error(
        "Instance import package downloads currently support up to 5000 checks per keyword.",
      ),
    );
    renderModal("selected", 5);

    expect(screen.queryByLabelText("Export range")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Export granularity")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "One or more keywords have too much history for this export. Switch to ranking history, then choose a shorter range or a coarser interval and try again.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(
        "Instance import package downloads currently support up to 5000 checks per keyword.",
      ),
    ).not.toBeInTheDocument();
  });
});
