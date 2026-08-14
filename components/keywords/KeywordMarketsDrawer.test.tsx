import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordMarketsDrawer } from "./KeywordMarketsDrawer";

vi.mock("@/components/ui", () => ({
  Button: ({
    children,
    loading: _loading,
    loadingLabel: _loadingLabel,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingLabel?: string }) => (
    <button {...props}>{children}</button>
  ),
  Sheet: ({
    children,
    footer,
    title,
  }: {
    children: ReactNode;
    footer: ReactNode;
    title: ReactNode;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  ),
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/components/keywords/add/ProjectMarketsSelector", () => ({
  ProjectMarketsSelector: ({
    onChange,
  }: {
    onChange: (value: { devices: ("desktop" | "mobile")[]; locationKeys: string[] }) => void;
  }) => (
    <div>
      <button
        onClick={() => onChange({ devices: ["mobile"], locationKeys: ["country:NL:lang:nl"] })}
        type="button"
      >
        Keep Netherlands mobile
      </button>
      <button
        onClick={() =>
          onChange({
            devices: ["desktop", "mobile"],
            locationKeys: ["country:US:lang:en", "country:NL:lang:nl"],
          })
        }
        type="button"
      >
        Add Netherlands
      </button>
      <button onClick={() => onChange({ devices: ["desktop"], locationKeys: [] })} type="button">
        Clear markets
      </button>
    </div>
  ),
}));

function target(id: string, locationKey: string, device: "Desktop" | "Mobile") {
  return {
    device,
    id,
    intent: "commercial",
    keyword: "rank tracker",
    location: {
      canonicalKey: locationKey,
      displayName: locationKey.includes(":NL:") ? "Netherlands" : "United States",
      languageLabel: locationKey.includes(":NL:") ? "Dutch" : "English",
    },
    schedule: {
      cron_expression: null,
      frequency: "weekly",
      jitter_minutes: 30,
      serp_depth: 100,
      timezone: "Europe/Warsaw",
    },
    tags: ["core"],
    targetUrl: "https://example.com/rank-tracker",
    topic: "SEO",
  } as never;
}

const projectMarkets = {
  markets: [],
  maxMarkets: 5,
  monthlyCostCents: 0,
  perMarketChecks: 4,
  projectId: "prj_test",
};

function setup(
  targets = [
    target("kw_us_desktop", "country:US:lang:en", "Desktop"),
    target("kw_us_mobile", "country:US:lang:en", "Mobile"),
    target("kw_nl_desktop", "country:NL:lang:nl", "Desktop"),
    target("kw_nl_mobile", "country:NL:lang:nl", "Mobile"),
  ],
  actions: Partial<
    Pick<
      ComponentProps<typeof KeywordMarketsDrawer>,
      "addKeywordsMatrixAction" | "bulkDeleteAction"
    >
  > = {},
) {
  const addKeywordsMatrixAction =
    actions.addKeywordsMatrixAction ?? vi.fn(async () => ({ keywords: [] }));
  const bulkDeleteAction = actions.bulkDeleteAction ?? vi.fn(async () => ({ deleted: 0 }));
  render(
    <KeywordMarketsDrawer
      addKeywordsMatrixAction={addKeywordsMatrixAction}
      bulkDeleteAction={bulkDeleteAction}
      canCreateKeyword
      keyword={targets[0]}
      onClose={vi.fn()}
      projectId="prj_test"
      projectMarkets={projectMarkets as never}
      targets={targets}
    />,
  );
  return { addKeywordsMatrixAction, bulkDeleteAction };
}

describe("KeywordMarketsDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes only deselected target IDs and routes away from a deleted current target", async () => {
    const actions = setup();

    expect(screen.getByRole("heading", { name: /Manage markets & devices/ })).toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep Netherlands mobile" }));
    expect(screen.getByLabelText("Keyword target change")).toHaveTextContent(
      "1 markets x 1 device = 1 checks per run",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save markets & devices" }));

    await waitFor(() =>
      expect(actions.bulkDeleteAction).toHaveBeenCalledWith({
        keywordIds: ["kw_us_desktop", "kw_us_mobile", "kw_nl_desktop"],
        projectId: "prj_test",
      }),
    );
    expect(actions.addKeywordsMatrixAction).not.toHaveBeenCalled();
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_test/rank-tracker/kw_nl_mobile");
  });

  it("adds the selected market-device matrix without deleting retained targets", async () => {
    const actions = setup([
      target("kw_us_desktop", "country:US:lang:en", "Desktop"),
      target("kw_us_mobile", "country:US:lang:en", "Mobile"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Add Netherlands" }));
    fireEvent.click(screen.getByRole("button", { name: "Save markets & devices" }));

    await waitFor(() => expect(actions.addKeywordsMatrixAction).toHaveBeenCalledOnce());
    expect(actions.addKeywordsMatrixAction).toHaveBeenCalledWith(
      expect.objectContaining({
        devices: ["desktop", "mobile"],
        keywords: ["rank tracker"],
        locations: [{ locationKey: "country:US:lang:en" }, { locationKey: "country:NL:lang:nl" }],
        projectId: "prj_test",
      }),
    );
    expect(actions.bulkDeleteAction).not.toHaveBeenCalled();
  });

  it("blocks an empty market selection before either mutation runs", () => {
    const actions = setup();

    fireEvent.click(screen.getByRole("button", { name: "Clear markets" }));
    expect(screen.getByRole("button", { name: "Save markets & devices" })).toBeDisabled();
    expect(screen.getByText("Select at least one market and device.")).toBeInTheDocument();
    expect(actions.addKeywordsMatrixAction).not.toHaveBeenCalled();
    expect(actions.bulkDeleteAction).not.toHaveBeenCalled();
  });

  it("keeps the current target when its replacement was not returned", async () => {
    const actions = setup([target("kw_us_desktop", "country:US:lang:en", "Desktop")]);

    fireEvent.click(screen.getByRole("button", { name: "Keep Netherlands mobile" }));
    fireEvent.click(screen.getByRole("button", { name: "Save markets & devices" }));

    expect(
      await screen.findByText(
        "The replacement target is not available yet. Refresh and try again.",
      ),
    ).toBeInTheDocument();
    expect(actions.addKeywordsMatrixAction).toHaveBeenCalledOnce();
    expect(actions.bulkDeleteAction).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("retries only the delete after a replacement was created and routes by public ID", async () => {
    const addKeywordsMatrixAction = vi.fn(async () => ({
      keywords: [
        {
          id: "keyword_internal_nl_mobile",
          publicId: "kw_nl_mobile",
          text: "rank tracker",
        },
      ],
    }));
    const bulkDeleteAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ deleted: 1 });
    setup([target("kw_us_desktop", "country:US:lang:en", "Desktop")], {
      addKeywordsMatrixAction,
      bulkDeleteAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Keep Netherlands mobile" }));
    fireEvent.click(screen.getByRole("button", { name: "Save markets & devices" }));

    expect(
      await screen.findByText(
        "New targets were added, but old targets could not be removed. Retry to finish.",
      ),
    ).toBeInTheDocument();
    expect(addKeywordsMatrixAction).toHaveBeenCalledOnce();
    expect(bulkDeleteAction).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Save markets & devices" }));

    await waitFor(() => expect(bulkDeleteAction).toHaveBeenCalledTimes(2));
    expect(addKeywordsMatrixAction).toHaveBeenCalledOnce();
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_test/rank-tracker/kw_nl_mobile");
  });
});
