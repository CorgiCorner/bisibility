import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { AppLocale } from "@/i18n/config";
import messages from "@/messages/core/en/project-dashboard.json";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./KpiCard";

const reorderedMessages = {
  ...messages,
  projectDashboard: {
    ...messages.projectDashboard,
    kpis: {
      ...messages.projectDashboard.kpis,
      averageComparison:
        "{direction, select, up {sube {value, number, ::.0}} down {baja {value, number, ::.0}} other {sin cambios}} desde la comprobación anterior",
      averagePosition: "Posición media",
      visibilityDetail:
        "{total, number} palabras en total; {measured, number} medidas{limited, select, true {, solo las más recientes} other {}}",
    },
  },
};

function renderKpi(children: ReactNode, customMessages = messages, locale: AppLocale = "en") {
  return render(
    <FeatureMessagesProvider locale={locale} messages={customMessages} timeZone="UTC">
      {children}
    </FeatureMessagesProvider>,
  );
}

describe("KpiCard", () => {
  it("formats visibility coverage from the semantic numeric payload", () => {
    renderKpi(
      <KpiCard
        delta={{ kind: "percentagePointChange", value: 2.4 }}
        deltaTone="positive"
        id="visibility"
        value={42}
        visibilityCoverage={{ limited: false, measured: 7, total: 10 }}
      />,
    );

    expect(screen.getByText("42%")).toBeVisible();
    expect(screen.getByText("7 of 10 keywords measured")).toBeVisible();
    expect(screen.getByText("+2.4pp")).toBeVisible();
  });

  it("preserves KPI direction, one-decimal precision, and unsigned zeroes", () => {
    renderKpi(
      <>
        <KpiCard
          delta={{ kind: "averageComparison", value: 1.3 }}
          deltaTone="positive"
          id="averagePosition"
          value={7}
        />
        <KpiCard
          delta={{ kind: "averageComparison", value: -1.3 }}
          deltaTone="negative"
          id="averagePosition"
          value={8}
        />
        <KpiCard
          delta={{ kind: "averageComparison", value: 0 }}
          deltaTone="neutral"
          id="averagePosition"
          value={9}
        />
        <KpiCard
          delta={{ kind: "percentagePointChange", value: 0 }}
          deltaTone="neutral"
          id="visibility"
          value={0}
        />
      </>,
    );

    expect(screen.getByText("7.0")).toBeVisible();
    expect(screen.getByText("up 1.3 vs previous ranked check")).toBeVisible();
    expect(screen.getByText("down 1.3 vs previous ranked check")).toBeVisible();
    expect(screen.getByText("0 vs previous ranked check")).toBeVisible();
    expect(screen.getByText("0.0pp")).toBeVisible();
    expect(screen.queryByText("+0.0pp")).not.toBeInTheDocument();
  });

  it("links a failed first-check state to check runs", () => {
    renderKpi(
      <KpiCard
        delta={{ kind: "firstCheckFailed" }}
        deltaAction="check_runs"
        deltaTone="negative"
        id="visibility"
        projectRef="prj_example"
        value={null}
      />,
    );

    expect(screen.getByRole("link", { name: "first check failed" })).toHaveAttribute(
      "href",
      "/app/prj_example/runs",
    );
  });

  it("uses the configured non-English locale for reordered ICU text and numeric formatting", () => {
    renderKpi(
      <KpiCard
        delta={{ kind: "averageComparison", value: 1.3 }}
        deltaTone="positive"
        id="averagePosition"
        value={12_345.5}
      />,
      reorderedMessages,
      "es-ES",
    );

    expect(screen.getByText("Posición media")).toBeVisible();
    expect(screen.getByText("12.345,5")).toBeVisible();
    expect(screen.getByText("sube 1,3 desde la comprobación anterior")).toBeVisible();
  });
});
