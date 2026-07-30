import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppErrorDiagnostics, formatAppErrorReport } from "./AppErrorDiagnostics";

const details = {
  digest: "err_9c41f2",
  message: "Cannot read properties of undefined (reading 'rows')",
  name: "TypeError",
  occurredAt: "01:28:57 UTC",
  pathname: "/app/keywords",
  stack: "TypeError: rows of undefined\n    at KeywordTable (keywords.view.js:412:19)",
};

describe("formatAppErrorReport", () => {
  it("carries the reference, view and stack into one block", () => {
    expect(formatAppErrorReport(details)).toBe(
      [
        "reference: err_9c41f2",
        "error: TypeError: Cannot read properties of undefined (reading 'rows')",
        "view: /app/keywords",
        "time: 01:28:57 UTC",
        "",
        details.stack,
      ].join("\n"),
    );
  });

  it("stays reportable when the digest and stack are stripped in production", () => {
    const report = formatAppErrorReport({ ...details, digest: undefined, stack: undefined });

    expect(report).toContain("reference: none");
    expect(report).toContain("(no stack trace captured)");
  });
});

describe("AppErrorDiagnostics", () => {
  it("keeps the error reference metadata compact", () => {
    render(<AppErrorDiagnostics details={details} />);

    expect(screen.getByText("err_9c41f2")).toHaveClass("text-[10px]");
    expect(screen.getByText("TypeError · 01:28:57 UTC")).toHaveClass("text-[10px]");
  });

  it("opens on the trace and collapses it on demand", async () => {
    const user = userEvent.setup();
    render(<AppErrorDiagnostics details={details} />);

    const toggle = screen.getByRole("button", { name: /err_9c41f2/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/keywords\.view\.js:412:19/)).toBeVisible();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/keywords\.view\.js:412:19/)).not.toBeVisible();
    expect(screen.getByText("Show trace")).toBeInTheDocument();
  });

  it("copies the whole report and confirms on the button", async () => {
    const user = userEvent.setup();
    // Installed after setup() so it wins over the stub userEvent registers.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<AppErrorDiagnostics details={details} />);

    await user.click(screen.getByRole("button", { name: /Copy details/ }));

    expect(writeText).toHaveBeenCalledWith(formatAppErrorReport(details));
    expect(screen.getByRole("button", { name: /Copied/ })).toBeInTheDocument();
  });

  it("labels a missing digest instead of rendering an empty reference", () => {
    render(<AppErrorDiagnostics details={{ ...details, digest: undefined }} />);

    expect(screen.getByText("no reference")).toBeInTheDocument();
  });
});
