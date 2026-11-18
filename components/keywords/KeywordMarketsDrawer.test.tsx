import { DrawerBackButton } from "@/components/ui/DrawerBackButton";
import type { SheetProps } from "@/components/ui/Sheet";
import { renderWithProjectMarketsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { createProjectMarket } from "@/lib/actions/project-market-create";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordMarketsDrawer } from "./KeywordMarketsDrawer";

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    loading: _loading,
    loadingLabel: _loadingLabel,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingLabel?: string }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/Sheet", () => ({
  Sheet: ({ backAction, children, footer, title }: SheetProps) => (
    <section role="dialog">
      <header>
        {backAction ? <DrawerBackButton {...backAction} /> : null}
        <h2>{title}</h2>
      </header>
      {children}
      {footer}
    </section>
  ),
}));
vi.mock("@/lib/actions/project-market-create", () => ({ createProjectMarket: vi.fn() }));
vi.mock("@/components/ui/toast-context", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function target(id: string, locationKey: string, device: "Desktop" | "Mobile") {
  return {
    device,
    id,
    intent: "commercial",
    keyword: "rank tracker",
    location: {
      canonicalKey: locationKey,
      displayName: locationKey === "NL" ? "Netherlands" : "United States",
      languageLabel: locationKey === "NL" ? "Dutch" : "English",
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

const projectId = `prj_${"a".repeat(24)}`;
const projectMarkets = {
  marketCreation: { registry: [], schedules: [], sources: [] },
  markets: [
    {
      canonicalKey: "US",
      countryCode: "US",
      displayName: "United States",
      id: "pmkt_us",
      languageCode: "en",
      languageLabel: "English",
      researchAvailable: true,
      status: "active",
    },
    {
      canonicalKey: "NL",
      countryCode: "NL",
      displayName: "Netherlands",
      id: "pmkt_nl",
      languageCode: "nl",
      languageLabel: "Dutch",
      researchAvailable: true,
      status: "active",
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 0,
  perMarketChecks: 4,
  projectId,
};

function setup(
  targets = [
    target("kw_us_desktop", "US", "Desktop"),
    target("kw_us_mobile", "US", "Mobile"),
    target("kw_nl_desktop", "NL", "Desktop"),
    target("kw_nl_mobile", "NL", "Mobile"),
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
  const onClose = vi.fn();
  render(
    <KeywordMarketsDrawer
      addKeywordsMatrixAction={addKeywordsMatrixAction}
      bulkDeleteAction={bulkDeleteAction}
      canCreateKeyword
      keyword={targets[0]}
      onClose={onClose}
      open
      projectId={projectId}
      projectMarkets={projectMarkets as never}
      targets={targets}
    />,
  );
  return { addKeywordsMatrixAction, bulkDeleteAction, onClose };
}

function keepNetherlandsMobile() {
  for (const [name, selected] of [
    ["United States / English", false],
    ["Netherlands / Dutch", true],
    ["Mobile", true],
    ["Desktop", false],
  ] as const) {
    const button = screen.getByRole("button", { name });
    if ((button.getAttribute("aria-pressed") === "true") !== selected) fireEvent.click(button);
  }
}

describe("KeywordMarketsDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes only deselected target IDs and routes away from a deleted current target", async () => {
    const actions = setup();

    expect(screen.getByRole("heading", { name: /Markets and devices/ })).toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
    keepNetherlandsMobile();
    expect(screen.getByLabelText("Keyword target change")).toHaveTextContent(
      "1 market x 1 device = 1 checks per run",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save markets and devices" }));

    await waitFor(() =>
      expect(actions.bulkDeleteAction).toHaveBeenCalledWith({
        keywordIds: ["kw_us_desktop", "kw_us_mobile", "kw_nl_desktop"],
        projectId,
      }),
    );
    expect(actions.addKeywordsMatrixAction).not.toHaveBeenCalled();
    expect(routerMock.push).toHaveBeenCalledWith(`/app/${projectId}/rank-tracker/kw_nl_mobile`);
  });

  it("adds the selected market-device matrix without deleting retained targets", async () => {
    const actions = setup([
      target("kw_us_desktop", "US", "Desktop"),
      target("kw_us_mobile", "US", "Mobile"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Netherlands / Dutch" }));
    fireEvent.click(screen.getByRole("button", { name: "Save markets and devices" }));

    await waitFor(() => expect(actions.addKeywordsMatrixAction).toHaveBeenCalledOnce());
    expect(actions.addKeywordsMatrixAction).toHaveBeenCalledWith(
      expect.objectContaining({
        devices: ["desktop", "mobile"],
        keywords: ["rank tracker"],
        locations: [{ locationKey: "US" }, { locationKey: "NL" }],
        projectId,
      }),
    );
    expect(actions.bulkDeleteAction).not.toHaveBeenCalled();
  });

  it("blocks an empty market selection before either mutation runs", () => {
    const actions = setup();

    for (const button of within(screen.getByRole("region", { name: "Markets" })).getAllByRole(
      "button",
      { pressed: true },
    ))
      fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Save markets and devices" })).toBeDisabled();
    expect(screen.getByText("Select at least one market and device.")).toBeInTheDocument();
    expect(actions.addKeywordsMatrixAction).not.toHaveBeenCalled();
    expect(actions.bulkDeleteAction).not.toHaveBeenCalled();
  });

  it("keeps the current target when its replacement was not returned", async () => {
    const actions = setup([target("kw_us_desktop", "US", "Desktop")]);

    keepNetherlandsMobile();
    fireEvent.click(screen.getByRole("button", { name: "Save markets and devices" }));

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
    setup([target("kw_us_desktop", "US", "Desktop")], {
      addKeywordsMatrixAction,
      bulkDeleteAction,
    });

    keepNetherlandsMobile();
    fireEvent.click(screen.getByRole("button", { name: "Save markets and devices" }));

    expect(
      await screen.findByText(
        "New targets were added, but old targets could not be removed. Retry to finish.",
      ),
    ).toBeInTheDocument();
    expect(addKeywordsMatrixAction).toHaveBeenCalledOnce();
    expect(bulkDeleteAction).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Save markets and devices" }));

    await waitFor(() => expect(bulkDeleteAction).toHaveBeenCalledTimes(2));
    expect(addKeywordsMatrixAction).toHaveBeenCalledOnce();
    expect(routerMock.push).toHaveBeenCalledWith(`/app/${projectId}/rank-tracker/kw_nl_mobile`);
  });
  it("opens the shared creator in the same drawer and keeps selections when going back", () => {
    const { onClose } = setup();
    keepNetherlandsMobile();
    const drawer = screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "New market" }));

    expect(screen.getAllByRole("dialog")).toEqual([drawer]);
    expect(screen.getByRole("heading", { name: "New market" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Country" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Start empty" })).not.toBeInTheDocument();
    const back = screen.getByRole("button", { name: "Back to keyword" });
    expect(back.closest("header")).toBeInTheDocument();
    fireEvent.click(back);

    expect(screen.getByRole("dialog")).toBe(drawer);
    expect(screen.getByRole("heading", { name: /Markets and devices/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Netherlands / Dutch" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "United States / English" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("creates an empty market, selects it on return, and adds the keyword only when saved", async () => {
    const user = userEvent.setup();
    vi.mocked(createProjectMarket).mockResolvedValue({
      canonicalKey: "ES",
      countryCode: "ES",
      displayName: "Spain",
      keywordCount: 0,
      kind: "country",
      languageCode: "es",
      languageLabel: "Spanish",
      publicId: `pmkt_${"b".repeat(24)}`,
    });
    const actions = setup();
    await user.click(screen.getByRole("button", { name: "Desktop" }));
    const drawer = screen.getByRole("dialog");
    await user.click(screen.getByRole("button", { name: "New market" }));
    await user.click(screen.getByRole("button", { name: "Country" }));
    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "Spain");
    await user.click(screen.getByRole("menuitem", { name: "Spain" }));
    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("menuitem", { name: "Spanish" }));
    await user.click(screen.getByRole("button", { name: "Create market" }));

    expect(createProjectMarket).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalKey: "ES",
        devices: ["mobile"],
        method: { kind: "empty" },
        projectId,
      }),
    );
    expect(await screen.findByRole("heading", { name: /Markets and devices/ })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toEqual([drawer]);
    expect(screen.getByRole("button", { name: "Spain / Spanish" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(actions.addKeywordsMatrixAction).not.toHaveBeenCalled();
    expect(actions.onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save markets and devices" }));
    expect(actions.addKeywordsMatrixAction).toHaveBeenCalledWith(
      expect.objectContaining({
        devices: ["mobile"],
        keywords: ["rank tracker"],
        locations: [{ locationKey: "US" }, { locationKey: "NL" }, { locationKey: "ES" }],
      }),
    );
  });
});

import {
  createSpendPreview,
  keywordCreateReviewCases,
} from "@/components/schedules/keyword-create-review.test-support";
import { beforeEach as reviewBeforeEach } from "vitest";

const reviewPort = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: reviewPort.preview,
}));
reviewBeforeEach(() =>
  reviewPort.preview.mockResolvedValue({
    ...createSpendPreview,
    requires_review: false,
    preview_token: null,
  }),
);

keywordCreateReviewCases("KeywordMarketsDrawer", reviewPort.preview, async () => {
  const add = vi.fn(async () => ({ keywords: [] }));
  const result = setup([target("kw_us_desktop", "US", "Desktop")], {
    addKeywordsMatrixAction: add,
  });
  fireEvent.click(screen.getByRole("button", { name: "Netherlands / Dutch" }));
  return {
    action: add,
    start: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save markets and devices" }));
    },
    assertDraft: () => {
      expect(result.onClose).not.toHaveBeenCalled();
      expect(result.bulkDeleteAction).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Netherlands / Dutch" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    },
  };
});
