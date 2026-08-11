import { TeamSettingsContentLoading } from "@/components/settings/team/TeamSettingsLoading";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("TeamSettingsContentLoading", () => {
  it("keeps the members footer and card geometry while team data loads", () => {
    const { container } = render(<TeamSettingsContentLoading />);

    expect(container.querySelectorAll("[data-team-loading-frame]")).toHaveLength(3);
    expect(container.querySelector('[data-team-loading-footer="members"]')).toBeInTheDocument();
    expect(
      container.querySelector('[data-team-loading-frame="pending-invites"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-team-loading-frame="roles"]')).toBeInTheDocument();
  });
});
