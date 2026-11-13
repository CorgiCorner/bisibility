import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import en from "@/messages/core/en/project-site-audit.json";
import sharedEn from "@/messages/core/en/shared.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteAuditForm } from "./SiteAuditForm";

const run = vi.fn(async () => undefined);

function renderForm(maxPages = 15) {
  return render(
    <FeatureMessagesProvider locale="en" messages={{ ...sharedEn, ...en }} timeZone="UTC">
      <SiteAuditForm busy={false} canRun maxPages={maxPages} run={run} workerEnabled={false} />
    </FeatureMessagesProvider>,
  );
}

describe("site audit form", () => {
  it("sets the field to the limit from the Max button", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(screen.getByLabelText("Pages to check")).toHaveProperty("value", "15");
  });

  it("clamps the value to the allowed range on blur", () => {
    renderForm();
    const field = screen.getByLabelText("Pages to check");
    fireEvent.change(field, { target: { value: "99" } });
    fireEvent.blur(field);
    expect(field).toHaveProperty("value", "15");
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.blur(field);
    expect(field).toHaveProperty("value", "1");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    expect(field).toHaveProperty("value", "1");
  });

  it("shows the limit error as soon as the typed value leaves the range", () => {
    renderForm();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByLabelText("Pages to check"), { target: { value: "20" } });
    const error = screen.getByRole("alert");
    expect(error.textContent).toBe("You can check up to 15 pages per audit right now.");
    expect(error.className).toContain("text-ui-caption");
    const field = screen.getByLabelText("Pages to check");
    expect(field.getAttribute("aria-describedby")).toBe("audit-pages-error");
    expect(field.getAttribute("step")).toBe("1");
    expect(run).not.toHaveBeenCalled();
  });

  it("places the cost helper under the controls", () => {
    renderForm();
    const helper = screen.getByText(/No provider credits/);
    const row = screen.getByRole("button", { name: "Run audit" }).parentElement;
    expect(row?.nextElementSibling).toBe(helper);
    expect(helper.className).toContain("text-ui-caption");
    expect(screen.queryByText(/Currently available/)).toBeNull();
    for (const name of ["Max", "Run audit"]) {
      expect(screen.getByRole("button", { name }).className).toContain("min-h-10");
    }
  });

  it("explains a zero page budget instead of offering a field", () => {
    renderForm(0);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "No pages are available for an audit right now.",
    );
  });
});
