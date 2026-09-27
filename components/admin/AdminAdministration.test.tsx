import {
  instanceAdminFeatureTestMessages,
  renderWithInstanceAdminMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/AdminAccountLookup", () => ({
  AdminAccountLookup: () => <section aria-label="Account lookup" />,
}));
vi.mock("@/components/account/SecurityFactors", () => ({
  SecurityFactors: () => <button type="button">Enable authenticator</button>,
}));
vi.mock("@/lib/actions/instance-mail-settings", () => ({
  clearInstanceMailSettings: vi.fn(),
  saveInstanceMailSettings: vi.fn(),
}));

import { AdminAdministration } from "./AdminAdministration";

function points(seed: number) {
  return Array.from({ length: 30 }, (_, index) => ({
    count: seed + index,
    date: `2026-06-${String(index + 1).padStart(2, "0")}`,
  }));
}

const metric = (seed: number) => ({
  delta: seed,
  deltaPercent: seed === 0 ? null : 12.5,
  points: points(seed),
  priorTotal: 100,
  total: 100 + seed,
});

const data = {
  activeAccountsApprox: 42,
  generatedAt: "2026-07-18T00:00:00.000Z",
  mailerConfigured: false,
  growth: {
    keywords: metric(3),
    projects: metric(2),
    rankChecks: metric(4),
    users: metric(1),
  },
  monthStart: "2026-07-01T00:00:00.000Z",
  topConsumption: Array.from({ length: 11 }, (_, index) => ({
    billableUnits: 2_000 - index,
    checks: 1_000 - index,
    projectId: `project_${index + 1}`,
    provider: index % 2 === 0 ? "serpapi" : "dataforseo",
    providerLabel: index % 2 === 0 ? "SerpApi" : "DataForSEO",
    rateBasis: index % 2 === 0 ? ("production_plan" as const) : ("live_depth" as const),
    referenceCostCents: 12_345 - index,
    referenceCostKnown: true,
    sharePercent: index === 0 ? 37.5 : 5,
  })),
} as const;

describe("AdminAdministration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders four 30-day growth sparklines and the approximate activity label", () => {
    const { container } = render(<AdminAdministration data={data} />);

    for (const label of ["Users", "Projects", "Keywords", "Rank checks"]) {
      const sparkline = screen.getByRole("img", { name: `${label} daily count trend` });
      expect(sparkline).toHaveAttribute("preserveAspectRatio", "none");
    }
    const paths = container.querySelectorAll('svg[aria-label$="daily count trend"] path');
    expect(paths).toHaveLength(4);
    for (const path of paths) {
      expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
    }
    expect(screen.getByText("Active accounts (approx.)")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(
      screen.getByText("Distinct accounts with session activity in the last 7 days."),
    ).toHaveClass("mb-0", "mt-auto", "pt-2");
    expect(screen.getAllByText("+12.5% vs prior 30 days")).toHaveLength(4);
  });

  it("renders at most ten project/provider rows with reference usage and share bars", () => {
    render(<AdminAdministration data={data} />);

    const table = screen.getByRole("table", {
      name: "Top project and provider consumption this month",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(within(table).getByText("project_1")).toBeInTheDocument();
    expect(within(table).queryByText("project_11")).not.toBeInTheDocument();
    expect(within(table).getByText("1,000")).toBeInTheDocument();
    expect(within(table).getByText("2,000")).toBeInTheDocument();
    expect(within(table).getAllByText("SerpApi").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Production plan equivalent").length).toBeGreaterThan(0);
    expect(within(table).getByText("$123.45")).toBeInTheDocument();
    expect(within(table).getByText("37.5%")).toBeInTheDocument();
    expect(
      within(table).getByRole("img", { name: "37.5% of instance reference cost" }).firstChild,
    ).toHaveStyle({ width: "37.5%" });
  });

  it("localizes flat, plan, and unavailable generated rate bases in the real consumption table", () => {
    const messages = structuredClone(instanceAdminFeatureTestMessages);
    messages.instanceAdmin.administration.consumption.rateBasisLiveDepth =
      "Cennik według głębokości";
    messages.instanceAdmin.administration.consumption.rateBasisProductionPlan =
      "Odpowiednik planu produkcyjnego";
    messages.instanceAdmin.administration.consumption.rateBasisUnavailable = "Stawka niedostępna";
    const topConsumption = [
      {
        ...data.topConsumption[0],
        projectId: "project_flat",
        provider: "flat-provider",
        providerLabel: "Flat Provider",
        rateBasis: "live_depth" as const,
        referenceCostCents: 0,
        referenceCostKnown: true,
        sharePercent: 0,
      },
      {
        ...data.topConsumption[1],
        projectId: "project_plan",
        provider: "plan-provider",
        providerLabel: "Plan Provider",
        rateBasis: "production_plan" as const,
        referenceCostCents: 125,
        referenceCostKnown: true,
        sharePercent: 100,
      },
      {
        ...data.topConsumption[2],
        projectId: "project_unknown",
        provider: "unknown-provider",
        providerLabel: "Unknown Provider",
        rateBasis: "unavailable" as const,
        referenceCostCents: 0,
        referenceCostKnown: false,
        sharePercent: 0,
      },
    ];

    renderWithFeatureMessages(<AdminAdministration data={{ ...data, topConsumption }} />, {
      locale: "pl",
      messages,
      timeZone: "Europe/Warsaw",
    });

    for (const label of ["Flat Provider", "Plan Provider", "Unknown Provider"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const label of [
      "Cennik według głębokości",
      "Odpowiednik planu produkcyjnego",
      "Stawka niedostępna",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/USD/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("reserves room for sortable consumption headers and fills a wide table container", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1_200);
    render(<AdminAdministration data={data} />);

    const table = screen.getByRole("table", {
      name: "Top project and provider consumption this month",
    });
    expect(table.style.getPropertyValue("--dt-table-width")).toBe("1200px");
    expect(table.style.getPropertyValue("--dt-col-units")).toBe("144px");
    expect(table.style.getPropertyValue("--dt-col-referenceCost")).toBe("140px");
  });

  it("shows the self-host mailer warning with canonical docs", () => {
    render(<AdminAdministration data={data} showMailerWarning />);

    expect(
      screen.getByRole("heading", { name: "Email provider not configured" }),
    ).toBeInTheDocument();
    const docsLink = screen.getByRole("link", { name: "Configure email delivery" });
    expect(docsLink).toHaveAttribute("href", "https://bisibility.com/docs/self-hosting/email");
    expect(docsLink.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps key fields hidden until the admin turns on two-factor authentication", () => {
    render(
      <AdminAdministration
        data={data}
        mailSettings={{
          credentialsConfigured: false,
          envOverridesSaved: false,
          hasPasswordCredential: false,
          provider: null,
          sender: "",
          twoFactorEnabled: false,
        }}
        showMailerWarning
      />,
    );

    expect(
      screen.getByText(/Settings already saved keep sending if it is turned off/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable authenticator" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Configure email delivery" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Turn on two-factor authentication" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Outbound mail" })).not.toBeInTheDocument();
  });

  it("explains that saved mail keeps sending after two-factor authentication is turned off", () => {
    render(
      <AdminAdministration
        data={{ ...data, mailerConfigured: true }}
        mailSettings={{
          credentialsConfigured: true,
          envOverridesSaved: false,
          hasPasswordCredential: true,
          provider: "resend",
          sender: "Mail <ops@example.com>",
          twoFactorEnabled: false,
        }}
        showMailerWarning={false}
      />,
    );

    expect(
      screen.getByText(/Two-factor authentication is required to save or change mail settings/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Email provider not configured" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Outbound mail" })).not.toBeInTheDocument();
  });

  it("shows a write-only mail form for an admin with two-factor authentication", () => {
    render(
      <AdminAdministration
        data={data}
        mailSettings={{
          credentialsConfigured: true,
          envOverridesSaved: true,
          hasPasswordCredential: true,
          provider: "resend",
          sender: "Mail <ops@example.com>",
          twoFactorEnabled: true,
        }}
        showMailerWarning
      />,
    );

    expect(screen.getByRole("heading", { name: "Outbound mail" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Configure email delivery" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Credentials are saved.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mail <ops@example.com>")).toBeInTheDocument();
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    expect(screen.getByText(/Environment variables are set/)).toBeInTheDocument();
  });

  it("does not show the mailer warning for Cloud", () => {
    render(<AdminAdministration data={data} showMailerWarning={false} />);

    expect(screen.queryByRole("heading", { name: "Email provider not configured" })).toBeNull();
  });

  it("renders honest consumption empty state", () => {
    render(<AdminAdministration data={{ ...data, topConsumption: [] }} />);

    expect(screen.getByText("No completed SERP checks recorded this month.")).toHaveClass(
      "text-fg-muted",
    );
  });
});
