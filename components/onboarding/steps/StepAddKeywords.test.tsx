import { DeploymentModeProvider } from "@/components/shell/DeploymentModeProvider";
import { KEYWORD_IMPORT_LIMIT_MESSAGE } from "@/lib/schemas/keyword";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AddKeywordsForm, AddKeywordsInput } from "./StepAddKeywords";
import { StepAddKeywords } from "./StepAddKeywords";

function keywordBox() {
  return screen.getByPlaceholderText("One keyword per line");
}

function keywordDefaults(keywords = ""): AddKeywordsForm {
  return {
    device: "desktop",
    devices: ["desktop"],
    keywords,
    locations: ["US"],
    projectId: "prj_1",
  };
}

function renderStep(
  props: Partial<ComponentProps<typeof StepAddKeywords>> = {},
  { withContinue = false } = {},
) {
  return render(
    <>
      <StepAddKeywords {...props} />
      {withContinue ? (
        <button form="onboarding-step-form" type="submit">
          Continue
        </button>
      ) : null}
    </>,
  );
}

describe("StepAddKeywords", () => {
  it("previews trimmed unique keywords and ignored duplicate lines", () => {
    renderStep({ defaultValues: keywordDefaults() });

    fireEvent.change(keywordBox(), {
      target: { value: " rank tracker \nRank Tracker\nseo api\n" },
    });

    expect(screen.getByText("2 unique keywords · 1 duplicate line ignored")).toBeInTheDocument();
  });

  it("shows the long-line limit warning exactly once, before and after submit", () => {
    const message = "1 line exceeds the 180-character keyword limit.";
    renderStep({ defaultValues: keywordDefaults("a".repeat(181)) }, { withContinue: true });

    expect(screen.getAllByText(message)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getAllByText(message)).toHaveLength(1);
  });

  it("renders the analytics teaser when no source is connected", () => {
    renderStep({ defaultValues: keywordDefaults() });

    expect(
      screen.getByText("Connect Search Console above to import your real queries."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Import top queries from Search Console/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render a Search Console import link before a project exists", () => {
    renderStep({ hasAnalyticsSource: true, importTopQueriesAction: vi.fn() });

    expect(
      screen.queryByRole("button", { name: /Import top queries from Search Console/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Reconnect your Google account" })).toBeNull();
  });

  it("renders the import button when an analytics source is connected", () => {
    renderStep({
      defaultValues: keywordDefaults(),
      hasAnalyticsSource: true,
      importTopQueriesAction: vi.fn(async () => ({ queries: [] })),
    });

    expect(
      screen.getByRole("button", { name: /Import top queries from Search Console/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Connect Search Console above to import your real queries."),
    ).not.toBeInTheDocument();
  });

  it("opens the suggestion picker and appends the confirmed queries", async () => {
    const importTopQueriesAction = vi.fn(async () => ({
      hidden: [],
      hiddenCount: 0,
      queries: ["seo api", "local seo"],
      suggestions: [
        { clicks: 9, impressions: 90, query: "seo api" },
        { clicks: 3, impressions: 40, query: "local seo" },
      ],
    }));
    const onKeywordsChange = vi.fn();
    renderStep({
      defaultValues: keywordDefaults("rank tracker\ncontent audit"),
      hasAnalyticsSource: true,
      importTopQueriesAction,
      onKeywordsChange,
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Import top queries from Search Console/i }),
    );

    await waitFor(() =>
      expect(importTopQueriesAction).toHaveBeenCalledWith({ limit: 50, projectId: "prj_1" }),
    );
    const confirm = await screen.findByRole("button", { name: /Add 2 keywords/i });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(keywordBox()).toHaveValue("rank tracker\ncontent audit\nseo api\nlocal seo"),
    );
    expect(onKeywordsChange).toHaveBeenLastCalledWith(
      "rank tracker\ncontent audit\nseo api\nlocal seo",
    );
  });

  it("links to Integrations when Search Console authorization needs reconnecting", async () => {
    renderStep({
      defaultValues: keywordDefaults(),
      hasAnalyticsSource: true,
      importTopQueriesAction: vi.fn(async () => ({
        queries: [],
        reason: "needs_reauth" as const,
      })),
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Import top queries from Search Console/i }),
    );

    expect(await screen.findByText("Google authorization has expired.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconnect your Google account" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
  });

  it("blocks over-long keywords and imports above the keyword limit", async () => {
    const addKeywordsAction = vi.fn();
    renderStep({ addKeywordsAction }, { withContinue: true });
    const longKeyword = "x".repeat(181);

    fireEvent.change(keywordBox(), { target: { value: longKeyword } });
    expect(screen.getByText("1 line exceeds the 180-character keyword limit.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(addKeywordsAction).not.toHaveBeenCalled());

    fireEvent.change(keywordBox(), {
      target: { value: Array.from({ length: 501 }, (_, index) => `keyword ${index}`).join("\n") },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByText(KEYWORD_IMPORT_LIMIT_MESSAGE)).toBeInTheDocument());
    expect(addKeywordsAction).not.toHaveBeenCalled();
  });

  it("does not infer provider cost before execution routing is known", () => {
    renderStep({
      costPerCheckCents: 5,
      flowState: { projectId: "prj_1", providerId: "serpapi" },
      monthlyCapCents: 500,
    });
    fireEvent.change(keywordBox(), { target: { value: "rank tracker\nseo api" } });

    expect(screen.getByText("≈ 60 checks/month at Top 100")).toBeInTheDocument();
    expect(screen.queryByText(/\$|monthly cost cap/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Estimate provider cost" })).toHaveAttribute(
      "href",
      "/rank-tracking-cost-calculator?keywords=2&locations=1&devices=desktop&frequency=daily&depth=100",
    );
  });

  it("shows the selected depth without presenting a provider cost", () => {
    renderStep({ costPerCheckCents: 5, flowState: { projectId: "prj_1", serpDepth: 10 } });

    fireEvent.change(keywordBox(), { target: { value: "rank tracker\nseo api" } });

    expect(screen.getByText("≈ 60 checks/month at Top 10")).toBeInTheDocument();
  });

  it("hides the hosted calculator link on self-hosted instances", () => {
    render(
      <DeploymentModeProvider deploymentMode="self-host">
        <StepAddKeywords flowState={{ projectId: "prj_1" }} />
      </DeploymentModeProvider>,
    );
    fireEvent.change(keywordBox(), { target: { value: "rank tracker" } });

    expect(screen.queryByRole("link", { name: "Estimate provider cost" })).toBeNull();
  });

  it("submits one matrix action and shows created/skipped feedback", async () => {
    const onComplete = vi.fn();
    const addKeywordsAction = vi.fn(async (_input: AddKeywordsInput) => ({
      created: 2,
      keywords: [
        { id: "keyword_1", publicId: "kw_1" },
        { id: "keyword_2", publicId: "kw_2" },
      ],
      skippedDuplicates: 6,
    }));
    renderStep(
      {
        addKeywordsAction,
        flowState: {
          devices: ["desktop", "mobile"],
          locations: ["US", "PL"],
          projectId: "prj_1",
          providerId: "serpapi",
        },
        onComplete,
      },
      { withContinue: true },
    );

    fireEvent.change(keywordBox(), { target: { value: " rank tracker \nRank Tracker\nseo api" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(addKeywordsAction).toHaveBeenCalledTimes(1));
    expect(addKeywordsAction).toHaveBeenCalledWith({
      devices: ["desktop", "mobile"],
      keywords: ["rank tracker", "seo api"],
      locations: [{ locationKey: "US" }, { locationKey: "PL" }],
      projectId: "prj_1",
      schedule: undefined,
      tags: [],
      targetUrl: null,
    });
    expect(await screen.findByText("2 added, 6 already tracked")).toBeInTheDocument();
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), 2, null),
    );
  });

  it("surfaces matrix location degrade warnings", async () => {
    const onComplete = vi.fn();
    const addKeywordsAction = vi.fn(async (_input: AddKeywordsInput) => ({
      created: 1,
      keywords: [{ id: "keyword_1", publicId: "kw_1" }],
      skippedDuplicates: 0,
      warnings: ["Austin was not found; tracking United States instead."],
    }));
    renderStep(
      {
        addKeywordsAction,
        flowState: { locations: ["US/Texas/Austin"], projectId: "prj_1" },
        onComplete,
      },
      { withContinue: true },
    );

    fireEvent.change(keywordBox(), { target: { value: "rank tracker" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("Austin was not found; tracking United States instead."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        1,
        "Austin was not found; tracking United States instead.",
      ),
    );
  });
});
