import { DevelopersLoading } from "@/components/settings/developers/DevelopersLoading";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("DevelopersLoading", () => {
  it("keeps one loading frame for each settled Developers card", () => {
    const { container } = render(<DevelopersLoading />);

    expect(container.querySelectorAll("[data-settings-loading-frame]")).toHaveLength(2);
    expect(container.querySelector('[data-settings-loading-frame="api-keys"]')).not.toBeNull();
    expect(
      container.querySelector('[data-settings-loading-frame="deploy-webhooks"]'),
    ).not.toBeNull();
  });
});
