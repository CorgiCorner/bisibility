import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import dashboardMessages from "@/messages/core/en/project-dashboard.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { stubResizeObserver } from "@/tests/observers";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PositionTrendCard } from "./PositionTrendCard";
import { ProjectDashboardMessages } from "./ProjectDashboardMessages";

describe("PositionTrendCard date display", () => {
  it("formats historical calendar keys but keeps the localized final now label", () => {
    const observers = stubResizeObserver();
    const messages = mergeMessageCatalogs(sharedMessages, {
      ...dashboardMessages,
      projectDashboard: {
        ...dashboardMessages.projectDashboard,
        positionTrend: {
          ...dashboardMessages.projectDashboard.positionTrend,
          now: "Ahora",
        },
      },
    });

    render(
      <ProjectDashboardMessages
        dateFormat="day_first"
        locale="es-ES"
        messages={messages}
        timeZone="UTC"
      >
        <PositionTrendCard
          data={[
            { dateKey: "2026-08-24", label: "2026-08-24", value: 9 },
            { dateKey: "2026-08-25", label: null, value: 7 },
          ]}
        />
      </ProjectDashboardMessages>,
    );

    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 250, width: 600 } } as ResizeObserverEntry]);
      }
    });

    expect(screen.getByText("24 de agosto de 2026")).toBeInTheDocument();
    expect(screen.getByText("Ahora")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-24")).not.toBeInTheDocument();
  });
});
