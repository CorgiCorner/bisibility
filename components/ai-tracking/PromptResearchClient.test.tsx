import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { AiResearchResult } from "@/lib/ai-research/types";
import research from "@/messages/core/en/project-ai-research.json";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { routerMock } from "@/tests/next-navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { PromptResearchClient } from "./PromptResearchClient";
import {
  researchPageFixture,
  researchQuoteFixture,
  researchResultFixture,
} from "./prompt-research-fixtures";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), track: vi.fn() }));
vi.mock("@/lib/actions/prompt-research", () => ({
  lookupPromptResearchAction: mocks.lookup,
  trackPromptResearchAction: mocks.track,
}));
function view(
  keyword = "",
  initial?: Omit<typeof researchResultFixture, "result"> & { result: AiResearchResult },
  cacheDuration = "12 hours",
) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...shared, ...tracking, ...research }}
        timeZone="UTC"
      >
        <PromptResearchClient
          projectId="prj_public"
          keyword={keyword}
          data={{ ...researchPageFixture, initial, cacheDuration }}
        />
      </FeatureMessagesProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue(researchQuoteFixture);
});
it("shows free keyboard-reachable keywords, validates blank input and navigates with q", async () => {
  const user = userEvent.setup();
  view();
  expect(screen.getByRole("link", { name: /seo tools/ })).toHaveAttribute(
    "href",
    "/app/prj_public/prompt-research?q=seo+tools",
  );
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a keyword.");
  const input = screen.getByRole("textbox", { name: "Keyword" });
  expect(input).toHaveAttribute("maxLength", "100");
  expect(input).toHaveAttribute("aria-describedby", "research-error research-cost");
  await user.type(input, "rank tools");
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(routerMock.push).toHaveBeenCalledWith("/app/prj_public/prompt-research?q=rank+tools");
  expect(mocks.lookup).not.toHaveBeenCalled();
});
it("gets a free quote and requires explicit confirmation before the paid lookup", async () => {
  const user = userEvent.setup();
  view("tools");
  expect(mocks.lookup).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Research" }));
  const dialog = await screen.findByRole("dialog", { name: "Review cost" });
  const confirm = await within(dialog).findByRole("button", { name: "Start" });
  expect(mocks.lookup).toHaveBeenCalledWith(
    "prj_public",
    expect.objectContaining({ estimate_only: true }),
  );
  expect(mocks.lookup).toHaveBeenCalledTimes(1);
  mocks.lookup.mockResolvedValueOnce(researchResultFixture);
  await user.click(confirm);
  expect(await screen.findByText("Best tools?")).toBeVisible();
  expect(mocks.lookup.mock.calls[1][1]).toMatchObject({
    accepted_payment: { quote_token: "accepted-quote-1" },
  });
  expect(screen.queryByText("20")).not.toBeInTheDocument();
});
it("expands sources and tracks selected prompts in a reviewed topic without a paid refresh", async () => {
  const user = userEvent.setup();
  view("tools", researchResultFixture);
  await user.click(screen.getByRole("button", { name: /Show sources for Best tools/ }));
  expect(screen.getByRole("button", { name: /Show sources for Best tools/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getAllByText("Brand mentioned")[0]).toBeVisible();
  expect(screen.getByRole("link", { name: "Example tools" })).toHaveAttribute(
    "href",
    "https://example.com/tools",
  );
  await user.click(screen.getByRole("checkbox", { name: "Select Best tools?" }));
  await user.click(screen.getByRole("button", { name: "Track prompts" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("textbox")).toHaveValue("Tools");
  mocks.track.mockResolvedValue({
    added: 1,
    topics: researchPageFixture.topics,
    tracked: ["best tools?"],
  });
  await user.click(
    within(dialog).getByRole("button", { name: "Save 1 prompts to Prompt Tracker" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.track).toHaveBeenCalledWith("prj_public", {
    reportId: researchResultFixture.reportId,
    rowIndices: [0],
    topic: "Tools",
  });
  expect(screen.queryByRole("checkbox", { name: "Select Best tools?" })).not.toBeInTheDocument();
  expect(mocks.lookup).not.toHaveBeenCalled();
});
it("renders empty results and honest dataset/market copy", () => {
  view("tools", { ...researchResultFixture, prompts: [] });
  expect(screen.getByText("No prompts found for “tools”")).toBeVisible();
  expect(screen.getByText("Try a shorter, broader term.")).toBeVisible();
  const market = screen.getByText("ChatGPT").closest("[data-prompt-research-market]");
  expect(market?.querySelector('[data-ai-engine="chat_gpt"]')).toBeInTheDocument();
  expect(market?.querySelector('[data-country-flag="US"]')).toBeInTheDocument();
  expect(screen.getByText("United States")).toBeVisible();
  expect(screen.getByText("/ English")).toBeVisible();
  expect(screen.getByText(/They are not logged ChatGPT prompts/)).toBeVisible();
});
it("renders loading and shared missing-budget errors", async () => {
  let finish: (value: unknown) => void = () => {};
  mocks.lookup.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  view("tools");
  await userEvent.click(screen.getByRole("button", { name: "Research" }));
  const loading = screen.getByRole("status");
  expect(loading).toHaveTextContent("Preparing a free cost estimate");
  expect(loading.querySelector("[data-payment-skeleton]")).toBeInTheDocument();
  expect(loading.closest('[role="dialog"]')).toBeInTheDocument();
  finish({ ok: false, reason: "budget_missing", message: "raw" });
  expect(await screen.findByRole("alert")).toHaveTextContent(shared.shared.errors.budgetMissing);
});
it("does not select prompts already tracked", () => {
  view("tools", {
    ...researchResultFixture,
    prompts: researchResultFixture.prompts.map((prompt) => ({ ...prompt, tracked: true })),
  });
  expect(screen.queryByRole("checkbox", { name: "Select Best tools?" })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Select visible rows" })).not.toBeInTheDocument();
});

it("does not describe a charged provider failure as an empty dataset", () => {
  view("tools", {
    ...researchResultFixture,
    prompts: [],
    result: { ...researchResultFixture.result, rows: [], failure: "Incomplete provider response" },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("The provider returned incomplete evidence");
  expect(screen.queryByText("No prompts found for “tools”")).not.toBeInTheDocument();
});

it.each([
  ["12 hours", 43200],
  ["7 days", 604800],
  ["2 weeks", 1209600],
] as const)(
  "renders the quoted cache duration inside the shared modal: %s",
  async (duration, seconds) => {
    mocks.lookup.mockResolvedValue({
      ...researchQuoteFixture,
      payment: {
        ...researchQuoteFixture.payment,
        cache: { state: "miss", freeUntil: null, windowSeconds: seconds },
      },
    });
    view("tools");
    expect(screen.queryByText(/Result stays free/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Research" }));
    const dialog = await screen.findByRole("dialog", { name: "Review cost" });
    expect(
      await within(dialog).findByText(`Result stays free to reopen for ${duration}`, {
        exact: false,
      }),
    ).toBeVisible();
    expect(screen.queryByText(/Up to 100 dataset rows.*Revisiting/)).not.toBeInTheDocument();
  },
);

it("closing the estimate never starts a paid lookup", async () => {
  const user = userEvent.setup();
  view("tools");
  await user.click(screen.getByRole("button", { name: "Research" }));
  const dialog = await screen.findByRole("dialog", { name: "Review cost" });
  await within(dialog).findByRole("button", { name: "Start" });
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.lookup).toHaveBeenCalledTimes(1);
  expect(mocks.lookup.mock.calls[0][1]).toMatchObject({ estimate_only: true });
});

it("cached evidence returned by the free lookup needs no payment confirmation", async () => {
  mocks.lookup.mockResolvedValue(researchResultFixture);
  view("tools");
  await userEvent.click(screen.getByRole("button", { name: "Research" }));
  expect(await screen.findByText("Best tools?")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.lookup).toHaveBeenCalledTimes(1);
  expect(mocks.lookup.mock.calls[0][1]).toMatchObject({ estimate_only: true });
});
