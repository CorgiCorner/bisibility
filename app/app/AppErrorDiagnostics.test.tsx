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
    expect(formatAppErrorReport(details, "self-host")).toBe(
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
    const report = formatAppErrorReport(
      { ...details, digest: undefined, stack: undefined },
      "self-host",
    );

    expect(report).toContain("reference: none");
    expect(report).toContain("(no stack trace captured)");
  });

  it("keeps the sanitized trace for self-hosted issue reports", () => {
    const report = formatAppErrorReport(
      {
        ...details,
        message: "Request failed at https://api.example.test/items?cursor=secret",
        pathname: "/app/prj_abc/keywords?cursor=x",
        stack: "Error at https://app.example.test/app/prj_abc/keywords?cursor=secret",
      },
      "self-host",
    );

    expect(report).toContain("error: TypeError: Request failed at https://api.example.test/items");
    expect(report).toContain("view: /app/<project>/keywords");
    expect(report).toContain("Error at https://app.example.test/app/<project>/keywords");
    expect(report).not.toContain("secret");
  });

  it("limits hosted support reports to the reference, view, and time", () => {
    const report = formatAppErrorReport(
      { ...details, pathname: "/app/prj_abc/keywords?cursor=x" },
      "cloud",
    );

    expect(report).toBe(
      ["reference: err_9c41f2", "view: /app/<project>/keywords", "time: 01:28:57 UTC"].join("\n"),
    );
    expect(report).not.toContain("TypeError");
    expect(report).not.toContain("KeywordTable");
  });
});

describe("AppErrorDiagnostics", () => {
  it("keeps the error reference metadata compact", () => {
    render(<AppErrorDiagnostics deploymentMode="self-host" details={details} />);

    expect(screen.getByText("err_9c41f2")).toHaveClass("text-[9px]");
    expect(screen.getByText("TypeError · 01:28:57 UTC")).toHaveClass("text-[9px]");
    expect(
      screen.getByText(
        "These details can include your project path. Review them before posting publicly.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a sanitized trace to hosted users", () => {
    render(
      <AppErrorDiagnostics
        deploymentMode="cloud"
        details={{
          ...details,
          message: "Failed at /app/prj_customer/keywords?cursor=secret",
          pathname: "/app/prj_customer/keywords?cursor=secret",
          stack: "Error at https://app.example.test/app/prj_customer/keywords?cursor=secret",
        }}
      />,
    );

    expect(
      screen.getByText("Error at https://app.example.test/app/<project>/keywords"),
    ).toBeVisible();
    expect(screen.queryByText(/prj_customer|cursor=secret/u)).not.toBeInTheDocument();
  });

  it("keeps the raw trace visible to self-hosted operators", () => {
    render(
      <AppErrorDiagnostics
        deploymentMode="self-host"
        details={{ ...details, stack: "Error at /srv/bisibility/app.js:12:4" }}
      />,
    );

    expect(screen.getByText("Error at /srv/bisibility/app.js:12:4")).toBeVisible();
  });

  it("opens on the trace and collapses it on demand", async () => {
    const user = userEvent.setup();
    render(<AppErrorDiagnostics deploymentMode="self-host" details={details} />);

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
    render(<AppErrorDiagnostics deploymentMode="self-host" details={details} />);

    await user.click(screen.getByRole("button", { name: /Copy details/ }));

    expect(writeText).toHaveBeenCalledWith(formatAppErrorReport(details, "self-host"));
    expect(screen.getByRole("button", { name: /Copied/ })).toBeInTheDocument();
  });

  it("labels a missing digest instead of rendering an empty reference", () => {
    render(
      <AppErrorDiagnostics
        deploymentMode="self-host"
        details={{ ...details, digest: undefined }}
      />,
    );

    expect(screen.getByText("no reference")).toBeInTheDocument();
  });
});
