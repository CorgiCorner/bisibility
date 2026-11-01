import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DomainRatingSettings } from "./DomainRatingSettings";

vi.mock("@/lib/actions/domain-rating", () => ({ setDomainRatingTracking: vi.fn() }));
function mount(hasOwnConnection: boolean) {
  render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <DomainRatingSettings
        canEdit
        data={{
          projectId: "prj_example",
          domain: "example.com",
          enabled: false,
          source: null,
          hasOwnConnection,
          points: [],
          lastAttemptAt: null,
          lastSuccessAt: null,
          lastError: null,
        }}
      />
    </FeatureMessagesProvider>,
  );
}
describe("rating connection settings", () => {
  it("offers connection management for a saved key even if it is paused", () => {
    mount(true);
    expect(screen.getByRole("link", { name: "Manage connection" })).toHaveAttribute(
      "href",
      "/app/prj_example/providers?connect=ahrefs#provider-ahrefs",
    );
    expect(screen.queryByRole("link", { name: "Connect Ahrefs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /check now/i })).not.toBeInTheDocument();
  });
  it("offers to connect when no saved key exists", () => {
    mount(false);
    expect(screen.getByRole("link", { name: "Connect Ahrefs" })).toBeInTheDocument();
  });
});
