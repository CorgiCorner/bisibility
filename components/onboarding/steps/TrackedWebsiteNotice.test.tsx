import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import onboardingMessages from "@/messages/core/en/onboarding.json";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrackedWebsiteNotice } from "./TrackedWebsiteNotice";

describe("TrackedWebsiteNotice", () => {
  it("formats the persisted tracking notice through the supplied onboarding messages", () => {
    renderWithFeatureMessages(
      <TrackedWebsiteNotice domain="example.com" since="2026-09-04T12:00:00.000Z" />,
      {
        dateFormat: "day_first",
        locale: "pl",
        messages: {
          onboarding: {
            ...onboardingMessages.onboarding,
            website: {
              ...onboardingMessages.onboarding.website,
              trackingStarted: "Sledzenie {domain} od {date}",
              trackingStartedDescription: "Ta strona ma juz kontrole pozycji.",
            },
          },
        },
      },
    );

    expect(screen.getByRole("status")).toHaveTextContent("Sledzenie example.com od");
    expect(screen.getByRole("status")).toHaveTextContent("Ta strona ma juz kontrole pozycji.");
    expect(screen.queryByText(/Tracking example.com since/)).not.toBeInTheDocument();
  });
});
