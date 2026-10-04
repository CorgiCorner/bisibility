import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { ActiveLocale } from "@/i18n/config";
import en from "@/messages/core/en/project-site-audit.json";
import sharedEn from "@/messages/core/en/shared.json";
import pl from "@/messages/core/pl/project-site-audit.json";
import sharedPl from "@/messages/core/pl/shared.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteAuditWorkspace } from "./SiteAuditWorkspace";
import { auditFixture } from "./story-fixtures";

const run = vi.fn(async () => auditFixture);
const props = {
  domain: "acme.com",
  projectId: "prj_demo",
  canRun: true,
  initial: null,
  history: [],
  runAction: run,
  readAction: async () => auditFixture,
};
const wrap = (locale: ActiveLocale = "en", overrides = {}) =>
  render(
    <FeatureMessagesProvider
      locale={locale}
      messages={locale === "pl" ? { ...sharedPl, ...pl } : { ...sharedEn, ...en }}
      timeZone="UTC"
    >
      <SiteAuditWorkspace {...props} {...overrides} />
    </FeatureMessagesProvider>,
  );
describe("site audit workspace", () => {
  it("runs the form and shows real returned URL issues", async () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Run audit" }));
    await waitFor(() => expect(screen.getByText("URL issues")).toBeTruthy());
    expect(run).toHaveBeenCalledWith({ projectId: "prj_demo", maxPages: 10 });
    expect(screen.getByText("Meta description is missing.")).toBeTruthy();
  });
  it("shows safe localized errors without leaking server exception messages", async () => {
    const action = vi
      .fn()
      .mockRejectedValue(new Error("Site audit rate limit reached. Internal reset key"));
    wrap("pl", { runAction: action });
    fireEvent.click(screen.getByRole("button", { name: "Uruchom audyt" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(pl.projectSiteAudit.errorRun),
    );
    expect(screen.queryByText(/Internal reset key/)).toBeNull();
  });
  it("blocks invalid limits before the action", async () => {
    const action = vi.fn();
    wrap("en", { runAction: action });
    fireEvent.change(screen.getByLabelText("Page limit"), { target: { value: "16" } });
    const form = screen.getByRole("button", { name: "Run audit" }).closest("form");
    if (!form) throw new Error("Audit form missing");
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(action).not.toHaveBeenCalled();
  });
  it("disables writes for viewers while allowing saved results", () => {
    wrap("en", { canRun: false, initial: auditFixture });
    expect(screen.getByRole("button", { name: "Run audit" })).toHaveProperty("disabled", true);
    expect(screen.getByText("URL issues")).toBeTruthy();
  });
  it("preserves unknown issue messages without accepting arbitrary translation paths", () => {
    const fixture = structuredClone(auditFixture);
    fixture.result.pages[0].issues = [
      { code: "unknown.future_code", severity: "info", message: "Future issue details" },
    ];
    wrap("en", { initial: fixture });
    expect(screen.getByText("Future issue details")).toBeTruthy();
  });
  it("uses the shared table and opens every page issue and metadata in the details drawer", async () => {
    const fixture = structuredClone(auditFixture);
    fixture.result.pages[0].issues = [
      { code: "missing_title", severity: "warning", message: "Title is missing." },
      { code: "missing_description", severity: "warning", message: "Meta description is missing." },
      { code: "noindex", severity: "info", message: "Robots directives disallow indexing." },
    ];
    const { container } = wrap("en", { initial: fixture });
    expect(screen.getByRole("table", { name: "URL issues" })).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Page details" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Page details" });
    expect(dialog.textContent).toContain("Robots directives disallow indexing.");
    expect(dialog.textContent).toContain("Monitor the keywords that matter to your business.");
  });
  it("localizes controls and parsed issue messages in Polish", () => {
    wrap("pl", { initial: auditFixture });
    expect(screen.getByRole("button", { name: "Uruchom audyt" })).toBeTruthy();
    expect(screen.getByText("Brak opisu meta.")).toBeTruthy();
    expect(screen.getByText("Nagłówki H1: 0; oczekiwany jeden.")).toBeTruthy();
  });
});
