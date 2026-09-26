import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { renderWithSearchInsightsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import messages from "@/messages/core/en/project-search-insights.json";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { storyCostContext, storyProjectMarkets } from "./drawer-story-fixtures";
import { TrackQueryDialog } from "./TrackQueryDialog";
import {
  trackConfirmLabel,
  trackCostLine,
  trackDefaultMarketKey,
  trackMarketOptions,
} from "./track-dialog-model";

const t = createTranslator({
  locale: "en",
  messages: messages.projectSearchInsights.copy,
});
const presentation = {
  formatUsage: (estimate: { unit: "cents" | "units" | null; quantity: number | null }) => {
    if (estimate.quantity === null || estimate.unit === null) return "Unknown";
    if (estimate.unit === "units")
      return `${new Intl.NumberFormat("en").format(estimate.quantity)} operations`;
    if (estimate.quantity > 0 && estimate.quantity < 1) return "< $0.01";
    return new Intl.NumberFormat("en", { currency: "USD", style: "currency" }).format(
      estimate.quantity / 100,
    );
  },
  t,
};

type Options = {
  costContext?: typeof storyCostContext;
  defaultMarketKey?: string | null;
  onConfirm?: (input: {
    device: string;
    locationKey: string;
    schedule: string;
    serpDepth: number;
  }) => void;
  readOnly?: boolean;
};

function renderDialog(options: Options = {}) {
  const onConfirm = options.onConfirm ?? vi.fn();
  render(
    <ProjectWriteModeProvider
      projectRef="prj_1"
      writeMode={options.readOnly ? "migration_hold" : "active"}
    >
      <TrackQueryDialog
        costContext={options.costContext ?? storyCostContext}
        defaultDevice="desktop"
        defaultMarketKey={
          options.defaultMarketKey === undefined ? "es-es" : options.defaultMarketKey
        }
        markets={storyProjectMarkets}
        onCancel={vi.fn()}
        onConfirm={onConfirm as never}
        query="rank tracking software"
      />
    </ProjectWriteModeProvider>,
  );
  return { onConfirm };
}

function ResetHarness() {
  const [query, setQuery] = useState<string | null>("rank tracking software");
  return (
    <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
      <button onClick={() => setQuery("rank tracking software")} type="button">
        Reopen
      </button>
      <TrackQueryDialog
        costContext={storyCostContext}
        defaultDevice="desktop"
        defaultMarketKey="es-es"
        markets={storyProjectMarkets}
        onCancel={() => setQuery(null)}
        onConfirm={vi.fn()}
        query={query}
      />
    </ProjectWriteModeProvider>
  );
}

describe("trackCostLine", () => {
  it("prices the selected depth and frequency at the customer's own rate", () => {
    expect(trackCostLine(storyCostContext, "project_default", 100, presentation)).toBe(
      "1 check per day / < $0.01 per check / $0.02 per month",
    );
    expect(trackCostLine(storyCostContext, "weekly", 20, presentation)).toBe(
      "1 check per week / < $0.01 per check / < $0.01 per month",
    );
  });

  it("uses the actual custom project default and never claims recurring manual or paused checks", () => {
    expect(
      trackCostLine(
        { ...storyCostContext, cronExpression: "0 6 * * 1", rawFrequency: "custom_cron" },
        "project_default",
        20,
        presentation,
      ),
    ).toContain("custom project schedule");
    expect(trackCostLine(storyCostContext, "manual", 20, presentation)).toBe(
      "No scheduled checks / < $0.01 per manual check",
    );
    expect(trackCostLine(storyCostContext, "paused", 20, presentation)).toBe("No scheduled checks");
  });

  it("drops money rather than inventing a price nobody quoted", () => {
    expect(
      trackCostLine(
        { ...storyCostContext, costPerCheckCents: null, providerId: null },
        "weekly",
        20,
        presentation,
      ),
    ).toBe("1 check per week");
  });

  it("shows upper-bound operations, never plan dollars, for a quota provider", () => {
    const quotaContext = { ...storyCostContext, costPerCheckCents: null, providerId: "serpapi" };
    const daily = trackCostLine(quotaContext, "daily", 100, presentation);
    expect(daily).toBe("1 check per day / 10 operations per check / 300 operations per month");
    expect(daily).not.toContain("$");
    expect(trackCostLine(quotaContext, "weekly", 20, presentation)).toBe(
      "1 check per week / 2 operations per check / 8 operations per month",
    );
  });
});

describe("trackConfirmLabel", () => {
  it.each([
    ["project_default", "Use project default: daily"],
    ["daily", "Start tracking daily"],
    ["weekly", "Start tracking weekly"],
    ["monthly", "Start tracking monthly"],
    ["manual", "Add as manual"],
    ["paused", "Add paused"],
  ] as const)("labels %s truthfully", (selection, expected) => {
    expect(trackConfirmLabel(selection, "daily", t)).toBe(expected);
  });
});

describe("trackDefaultMarketKey", () => {
  it("prefers the project's own market, but never a paused one", () => {
    const options = trackMarketOptions(storyProjectMarkets);

    expect(trackDefaultMarketKey(options, "es-en")).toBe("es-en");
    expect(trackDefaultMarketKey(options, "be-nl")).toBe("es-es");
    expect(trackDefaultMarketKey(options, null)).toBe("es-es");
    expect(trackDefaultMarketKey([], "es-es")).toBeNull();
  });
});

describe("TrackQueryDialog", () => {
  it("names the query, the cost and who is billed for it", () => {
    renderDialog();

    expect(screen.getByText("rank tracking software")).toBeInTheDocument();
    expect(screen.getByText("What this costs")).toBeInTheDocument();
    expect(
      screen.getByText("1 check per day / < $0.01 per check / $0.02 per month"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing is spent until you confirm/)).toBeInTheDocument();
  });

  it("preselects the project's market and device, and refuses a paused market", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: /Spain \/ Spanish/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Belgium/ })).toBeDisabled();
  });

  it("defaults schedule and depth from the project, then confirms changed selections once", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent(
      "Project default, daily",
    );
    expect(screen.getByRole("button", { name: "Search depth" })).toHaveTextContent("Top 100");

    await user.click(screen.getByRole("button", { name: /Spain \/ English/ }));
    await user.click(screen.getByRole("button", { name: "Mobile" }));
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Search depth" }));
    await user.click(screen.getByRole("menuitem", { name: "Top 10" }));
    expect(screen.getByRole("button", { name: "Search depth" })).toHaveAccessibleDescription(
      "Top 10 checks do not update Visibility. Affected keywords still count toward its coverage total.",
    );
    await user.hover(screen.getByRole("button", { name: "Search depth" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Top 10 checks do not update Visibility",
    );
    await user.click(screen.getByRole("button", { name: "Start tracking weekly" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      device: "mobile",
      locationKey: "es-en",
      schedule: "weekly",
      serpDepth: 10,
    });
  });

  it("resets schedule and depth after the modal exits", async () => {
    const user = userEvent.setup();
    render(<ResetHarness />);

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Search depth" }));
    await user.click(screen.getByRole("menuitem", { name: "Top 20" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Reopen" }));

    expect(await screen.findByRole("button", { name: "Schedule" })).toHaveTextContent(
      "Project default, daily",
    );
    expect(screen.getByRole("button", { name: "Search depth" })).toHaveTextContent("Top 100");
  });

  it("refuses to spend anything on a read-only project", () => {
    const { onConfirm } = renderDialog({ readOnly: true });

    expect(screen.getByRole("button", { name: "Use project default: daily" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
