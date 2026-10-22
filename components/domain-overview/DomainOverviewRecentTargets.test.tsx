import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DomainOverviewRecentTargets } from "./DomainOverviewRecentTargets";

afterEach(() => {
  vi.useRealTimers();
});

it("formats the remaining cache window on a recent target", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
  render(
    <DomainOverviewRecentTargets
      onOpen={vi.fn()}
      targets={[
        {
          cachedUntil: "2026-08-19T10:00:00.000Z",
          fetchedAt: "2026-08-12T10:00:00.000Z",
          languageCode: "en",
          locationCode: 2840,
          scope: "root",
          target: "example.com",
        },
      ]}
    />,
  );
  expect(screen.getByText("cached, free for 7 days")).toBeInTheDocument();
});
