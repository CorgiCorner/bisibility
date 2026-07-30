import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddKeywordCsvPanel } from "./AddKeywordCsvPanel";

describe("AddKeywordCsvPanel", () => {
  it("handles dropped CSV files, pasted text, errors, and singular counts", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <AddKeywordCsvPanel
        csvText="rank"
        errorMessage="Bad CSV"
        onCsvTextChange={onChange}
        parsedCount={1}
      />,
    );
    expect(screen.getByText("1 keyword parsed")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Paste CSV"), { target: { value: "next" } });
    const file = new File(["keyword\nrank tracker"], "keywords.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: vi.fn(async () => "keyword\nrank tracker") });
    fireEvent.drop(container.querySelector("label") as HTMLLabelElement, {
      dataTransfer: { files: [file] },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("keyword\nrank tracker"));
    expect(screen.getByText("Bad CSV")).toBeInTheDocument();
  });
});
