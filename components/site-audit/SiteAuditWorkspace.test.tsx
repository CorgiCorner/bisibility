import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { ActiveLocale } from "@/i18n/config";
import { capacityNoticeSnapshot, publishCapacityNotice } from "@/lib/capacity/notice-store";
import en from "@/messages/core/en/project-site-audit.json";
import sharedEn from "@/messages/core/en/shared.json";
import pl from "@/messages/core/pl/project-site-audit.json";
import sharedPl from "@/messages/core/pl/shared.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteAuditWorkspace } from "./SiteAuditWorkspace";
import { auditFixture, failedAuditFixture } from "./story-fixtures";

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
  it("accepts a catalog-sized crawl above the legacy page ceiling", async () => {
    const action = vi.fn(async () => auditFixture);
    wrap("en", { runAction: action, maxPages: 5000, workerEnabled: true });
    fireEvent.change(screen.getByLabelText("Page limit"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Run audit" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ projectId: "prj_demo", maxPages: 120 }),
    );
  });
  it("publishes structured start and resume denials without a generic error or success refresh", async () => {
    const denial = {
      ok: false,
      capacityFailure: {
        code: "plan_limit_reached",
        message: "Capacity reached",
        details: {
          dimension: "concurrentCrawls",
          limit: 1,
          used: 1,
          requested: 1,
          scope: "account",
        },
      },
    };
    const action = vi.fn(async () => denial);
    const readAction = vi.fn();
    const saved = {
      ...auditFixture,
      run: {
        state: "cancelled",
        stopReason: "cancelled",
        pagesCrawled: 1,
        budgetPages: 5000,
        requests: 1,
        startedAt: null,
        completedAt: null,
      },
    };
    wrap("en", {
      runAction: action,
      resumeAction: action,
      readAction,
      workerEnabled: true,
      initial: saved,
    });
    fireEvent.click(screen.getByRole("button", { name: "Run audit" }));
    await waitFor(() =>
      expect(capacityNoticeSnapshot()?.details?.dimension).toBe("concurrentCrawls"),
    );
    publishCapacityNotice(null);
    fireEvent.click(screen.getByRole("button", { name: "Resume audit" }));
    await waitFor(() =>
      expect(capacityNoticeSnapshot()?.details?.dimension).toBe("concurrentCrawls"),
    );
    expect(screen.queryByText(en.projectSiteAudit.errorRun)).toBeNull();
    expect(readAction).not.toHaveBeenCalled();
    publishCapacityNotice(null);
  });
  it("leaves the page title to the shared shell", () => {
    wrap();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByText(/Check HTTP, metadata/)).toBeTruthy();
  });
  it("shows an unavailable fetch as unknown, not measured zeros or noindex", async () => {
    wrap("en", { initial: failedAuditFixture });
    expect(screen.getByText(/0 pages fetched · 1 not fetched/)).toBeTruthy();
    expect(screen.getByText(/Incomplete audit: some pages or robots.txt/)).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
    expect(screen.getByText("Not measured")).toBeTruthy();
    expect(screen.queryByText(/0 ms|0 H1|Partial crawl: finished|pages checked/)).toBeNull();
    expect(screen.queryByText("No")).toBeNull();
    expect(screen.queryByText("No title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Page details" }));
    const dialog = await screen.findByRole("dialog", { name: "Page details" });
    expect(dialog.textContent).toContain("The public hostname could not be resolved.");
    expect(dialog.textContent).not.toContain("No directive");
    expect(dialog.textContent).not.toContain("Missing");
  });
  it("keeps real zero measurements and a measured noindex result", () => {
    const fixture = structuredClone(auditFixture);
    fixture.result.pages = [{ ...fixture.result.pages[1], responseTimeMs: 0, indexable: false }];
    wrap("en", { initial: fixture });
    expect(screen.getByText("0 ms · 0 H1")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
  });
  it("localizes safe failure reasons and hides raw details in old saved reports", () => {
    const fixture = structuredClone(failedAuditFixture);
    fixture.result.pages[0].issues[0].message =
      "getaddrinfo ENOTFOUND secret-value.internal.example.com";
    const { container } = wrap("pl", { initial: fixture });
    expect(screen.getByText(pl.projectSiteAudit.fetchReasons.dns)).toBeTruthy();
    expect(screen.getByText("Nieznana")).toBeTruthy();
    expect(container.textContent).not.toContain("secret-value");
  });
  it("runs the form and shows real returned URL issues", async () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Run audit" }));
    await screen.findByText("Meta description is missing.", {}, { timeout: 10_000 });
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
  it("shows worker progress and lets a writer cancel the active audit", async () => {
    const active = {
      ...structuredClone(auditFixture),
      run: {
        state: "running",
        stopReason: null,
        pagesCrawled: 2,
        budgetPages: 15,
        requests: 3,
        startedAt: null,
        completedAt: null,
      },
    };
    const cancelled = {
      ...active,
      run: { ...active.run, state: "cancelled", stopReason: "cancelled" },
    };
    const cancelAction = vi.fn(async () => cancelled.run);
    const readAction = vi.fn(async () => cancelled);
    wrap("en", { domain: "example.com", initial: active, cancelAction, readAction });
    expect(screen.getByText(/Running.*2.*15/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel audit" }));
    await waitFor(() => expect(screen.getByText(/Cancelled.*2.*15/)).toBeTruthy());
    expect(cancelAction).toHaveBeenCalledWith({ projectId: "prj_demo", reportId: active.id });
  });
  it("does not offer cancellation to a read-only viewer", () => {
    const active = {
      ...structuredClone(auditFixture),
      run: {
        state: "running",
        stopReason: null,
        pagesCrawled: 2,
        budgetPages: 15,
        requests: 3,
        startedAt: null,
        completedAt: null,
      },
    };
    wrap("en", { domain: "example.com", canRun: false, initial: active, cancelAction: vi.fn() });
    expect(screen.queryByRole("button", { name: "Cancel audit" })).toBeNull();
  });
  it("links an unverified crawl stop to domain verification", () => {
    const stopped = {
      ...structuredClone(auditFixture),
      run: {
        state: "stopped",
        stopReason: "unverified_cap",
        pagesCrawled: 500,
        budgetPages: 500,
        requests: 500,
        startedAt: null,
        completedAt: "2026-10-02T10:00:02.000Z",
      },
    };
    wrap("en", { initial: stopped });
    expect(
      screen.getByRole("link", { name: "Verify this domain to crawl more pages." }),
    ).toHaveAttribute("href", "/app/prj_demo/settings/general");
  });
});
