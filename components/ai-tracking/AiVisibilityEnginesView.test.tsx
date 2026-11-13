import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { buildEnginesPageModel } from "@/lib/ai-tracking/engines-model";
import { toggleableProjectEngines } from "@/lib/ai-tracking/project-engine-set";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AiVisibilityEnginesView } from "./AiVisibilityEnginesView";

const messages = { ...shared, ...tracking };
const toggleable = toggleableProjectEngines();

afterEach(() => {
  cleanup();
});

function model(input: Partial<Parameters<typeof buildEnginesPageModel>[0]> = {}) {
  return buildEnginesPageModel({
    canWrite: true,
    connected: true,
    enabled: [{ engine: "chat_gpt", source: "consumer_scrape" }],
    hasRankChecks: true,
    prices: { usdByEngine: { chat_gpt: 0.12, gemini: 0.08 } },
    recentByEngine: { "consumer_scrape:chat_gpt": 3 },
    toggleable,
    ...input,
  });
}

function view(page = model(), onToggle = vi.fn(async () => ({ ok: true as const }))) {
  renderWithFeatureMessages(
    <AiVisibilityEnginesView
      model={page}
      onToggle={onToggle}
      projectId="prj_example"
      providersHref="/app/prj_example/providers"
      rankHref="/app/prj_example/rank-tracker?reportView=ai_overviews"
    />,
    { messages, timeZone: "UTC" },
  );
  return onToggle;
}

it("shows prices, the provider and a toggle only for engines the page can run", async () => {
  const onToggle = view();
  expect(screen.getByRole("link", { name: "Engines" })).toHaveAttribute(
    "href",
    "/app/prj_example/ai-visibility?tab=engines",
  );
  expect(screen.getByText(/You choose engines/)).toBeInTheDocument();
  expect(screen.getByText("by length")).toBeInTheDocument();
  expect(screen.getByText("free, from Rank Tracker")).toBeInTheDocument();
  expect(screen.getByText("3 answers in the last 30 days")).toBeInTheDocument();
  expect(screen.getAllByText("Not available yet")).toHaveLength(3);
  expect(screen.getByText("The first connected provider answers each engine.")).toBeInTheDocument();
  expect(screen.getByText(/Answers ChatGPT and Gemini/)).toBeInTheDocument();
  const perplexity = screen.getByRole("row", { name: /Perplexity/ });
  expect(within(perplexity).queryByRole("button")).not.toBeInTheDocument();
  expect(within(perplexity).queryByRole("link")).not.toBeInTheDocument();
  await userEvent.click(screen.getAllByRole("button", { name: "Turn on" })[0]);
  expect(onToggle).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: true, engine: "gemini", source: "consumer_scrape" }),
  );
});

it("links to Providers when DataForSEO is not connected and hides a missing price", () => {
  view(model({ connected: false, prices: { usdByEngine: {} } }));
  expect(
    screen.getAllByRole("link", { name: "Connect DataForSEO in Providers" }).length,
  ).toBeGreaterThan(0);
  expect(screen.getByText("Not connected")).toBeInTheDocument();
  expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
});

it("keeps a read-only project from turning an engine on", () => {
  view(model({ canWrite: false }));
  expect(screen.queryByRole("button", { name: "Turn on" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Turn off" })).not.toBeInTheDocument();
});

it("updates engine availability from refreshed server props", () => {
  const props = {
    onToggle: vi.fn(),
    projectId: "prj_example",
    providersHref: "/app/prj_example/providers",
    rankHref: "/app/prj_example/rank-tracker?reportView=ai_overviews",
  };
  const { rerender } = renderWithFeatureMessages(
    <AiVisibilityEnginesView {...props} model={model()} />,
    { messages },
  );
  expect(screen.getAllByRole("button", { name: "Turn on" }).length).toBeGreaterThan(0);
  rerender(<AiVisibilityEnginesView {...props} model={model({ canWrite: false })} />);
  expect(screen.queryByRole("button", { name: "Turn on" })).not.toBeInTheDocument();
  rerender(<AiVisibilityEnginesView {...props} model={model()} />);
  expect(screen.getAllByRole("button", { name: "Turn on" }).length).toBeGreaterThan(0);
});
