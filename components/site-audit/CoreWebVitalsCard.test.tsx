import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import auditMessages from "@/messages/core/en/project-site-audit.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoreWebVitalsCard } from "./CoreWebVitalsCard";

const messages = mergeMessageCatalogs(sharedMessages, auditMessages);

describe("Core Web Vitals card", () => {
  it("asks to connect and does not show a zero pass count", () => {
    render(
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <CoreWebVitalsCard
          canCheck={false}
          checkAction={async () => ({ checked: 0, code: "not_connected", ok: false })}
          model={{
            connected: false,
            desktop: { passCount: 0, rows: [] },
            mobile: { passCount: 0, rows: [] },
          }}
          projectId="prj_1"
        />
      </FeatureMessagesProvider>,
    );
    expect(screen.getByRole("link", { name: "Connect PageSpeed Insights" })).toHaveAttribute(
      "href",
      "/app/prj_1/providers?connect=pagespeed",
    );
    expect(screen.queryByText(/pages pass/)).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("labels a lab estimate separately from field data", () => {
    render(
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <CoreWebVitalsCard
          canCheck
          checkAction={async () => ({ checked: 1, ok: true })}
          model={{
            connected: true,
            desktop: { passCount: 0, rows: [] },
            mobile: {
              passCount: 0,
              rows: [
                {
                  cls: 0.31,
                  inpMs: null,
                  lcpMs: 4600,
                  path: "/pricing",
                  source: "lab",
                  status: "poor",
                },
              ],
            },
          }}
          projectId="prj_1"
        />
      </FeatureMessagesProvider>,
    );
    expect(screen.getAllByText("Lab estimate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Poor").length).toBeGreaterThan(0);
    expect(screen.queryByText("Field data from real users")).not.toBeInTheDocument();
  });
});
