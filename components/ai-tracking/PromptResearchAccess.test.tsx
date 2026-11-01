import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProviderAccessScopeProvider } from "@/components/ui/ProviderAccessScopeProvider";
import research from "@/messages/core/en/project-ai-research.json";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { PromptResearchClient } from "./PromptResearchClient";
import {
  researchPageFixture,
  researchQuoteFixture,
  researchResultFixture,
} from "./prompt-research-fixtures";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/prompt-research", () => ({ lookupPromptResearchAction: lookup }));
const noSource = { ok: false as const, reason: "no_source" as const, message: "No source" };
function view({
  hasSource = true,
  reader = false,
  initial = false,
  keyword = "tools",
  cached = false,
} = {}) {
  return render(
    <ProviderAccessScopeProvider
      scope={{ readOnly: reader, canManageProviders: !reader, projectRef: "prj_public" }}
    >
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...shared, ...tracking, ...research }}
        timeZone="UTC"
      >
        <PromptResearchClient
          projectId="prj_public"
          keyword={keyword}
          data={{
            ...researchPageFixture,
            hasSource,
            canWrite: !reader,
            initial: cached ? researchResultFixture : initial ? noSource : undefined,
          }}
        />
      </FeatureMessagesProvider>
    </ProviderAccessScopeProvider>,
  );
}
function expectGate() {
  expect(screen.getAllByText(shared.shared.providerAccess.emptyDescription)).toHaveLength(1);
  expect(screen.getByText("Supported providers: DataForSEO.")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Keyword" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  expect(screen.queryByText(/projectAiTracking\./)).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
}
beforeEach(() => lookup.mockReset());
it("locks the shared search/results gate before the first estimate", () => {
  const { container } = view({ hasSource: false });
  expectGate();
  expect(container.querySelector("[data-provider-locked] fieldset")).toBeDisabled();
  expect(
    screen.getByRole("link", { name: shared.shared.providerAccess.connectAction }),
  ).toHaveAttribute("href", "/app/prj_public/providers");
  expect(lookup).not.toHaveBeenCalled();
});
it("uses the same gate for an initial no_source outcome", () => {
  view({ initial: true });
  expectGate();
  expect(lookup).not.toHaveBeenCalled();
});
it("locks search and results when an in-flow estimate returns no_source", async () => {
  lookup.mockResolvedValue(noSource);
  view();
  await userEvent.click(screen.getByRole("button", { name: "Research" }));
  await screen.findByText("Supported providers: DataForSEO.");
  expectGate();
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(lookup).toHaveBeenCalledWith(
    "prj_public",
    expect.objectContaining({ estimate_only: true }),
  );
});
it("locks the same gate if the source disappears after the estimate", async () => {
  lookup.mockResolvedValueOnce(researchQuoteFixture).mockResolvedValueOnce(noSource);
  view();
  await userEvent.click(screen.getByRole("button", { name: "Research" }));
  await userEvent.click(await screen.findByRole("button", { name: "Start" }));
  await screen.findByText("Supported providers: DataForSEO.");
  expectGate();
  expect(lookup).toHaveBeenCalledTimes(2);
});
it("inherits the shared reader behavior without a setup action or estimate", () => {
  view({ hasSource: false, reader: true });
  expectGate();
  expect(
    screen.queryByRole("link", { name: shared.shared.providerAccess.connectAction }),
  ).not.toBeInTheDocument();
  expect(lookup).not.toHaveBeenCalled();
});

it("places source setup immediately after the disabled search and keeps the dataset notice last", () => {
  view({ hasSource: false, keyword: "" });
  expectGate();
  expect(screen.queryByRole("region", { name: "Relevant keywords" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /seo tools/ })).not.toBeInTheDocument();
  const searchGate = screen.getByRole("textbox").closest("[data-provider-locked]");
  const empty = screen
    .getByText(shared.shared.providerAccess.emptyDescription)
    .closest("[data-provider-empty-state]");
  const notice = screen.getByText(/They are not logged ChatGPT prompts/);
  expect(searchGate?.nextElementSibling).toBe(empty);
  expect(empty?.nextElementSibling).toBe(notice);
  expect(notice.parentElement?.lastElementChild).toBe(notice);
  expect(lookup).not.toHaveBeenCalled();
});

it("retains cached evidence and locks its actions if the source is missing", () => {
  view({ hasSource: false, cached: true });
  expect(screen.getByText("Cached result · no new charge")).toBeVisible();
  expect(screen.getByText("Best tools?")).toBeVisible();
  expect(screen.getByRole("checkbox", { name: "Select Best tools?" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  expect(screen.queryByText(shared.shared.providerAccess.emptyDescription)).not.toBeInTheDocument();
  expect(lookup).not.toHaveBeenCalled();
});
