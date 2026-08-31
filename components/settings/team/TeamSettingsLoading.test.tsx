import { TeamSettingsContentLoading } from "@/components/settings/team/TeamSettingsLoading";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("TeamSettingsContentLoading", () => {
  it("keeps the members footer and lets member and invite cards size to content while team data loads", () => {
    const { container } = render(<TeamSettingsContentLoading />);

    const membersFrame = container.querySelector('[data-team-loading-frame="members"]');
    const pendingInvitesFrame = container.querySelector(
      '[data-team-loading-frame="pending-invites"]',
    );

    expect(container.querySelectorAll("[data-team-loading-frame]")).toHaveLength(3);
    expect(container.querySelector('[data-team-loading-footer="members"]')).toBeInTheDocument();
    expect(membersFrame).not.toHaveClass("h-[540px]", "sm:h-[400px]");
    expect(pendingInvitesFrame).not.toHaveClass("h-[550px]", "sm:h-[335px]");
    expect(container.querySelector('[data-team-loading-frame="roles"]')).toBeInTheDocument();
  });
});
