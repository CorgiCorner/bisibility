import { GeneralSettingsContent } from "@/components/settings/general/GeneralSettingsContent";
import {
  GeneralSettingsLoading,
  GeneralSettingsRouteLoading,
} from "@/components/settings/general/GeneralSettingsLoading";
import { generalSettingsCardGeometryClassNames } from "@/components/settings/general/general-settings-layout";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const props = {
  canCreateTags: true,
  canDeleteTags: true,
  canEditProject: true,
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  project: { domain: "example.com", name: "Example", projectId: "prj_7Kd2Qf9m" },
  requestDomainChange: vi.fn(),
  tags: [{ color: "var(--blue)", label: "brand" }],
  updateProject: vi.fn(),
};

describe("GeneralSettingsLoading", () => {
  it("uses the same settled frame geometry for both General cards", () => {
    const { container } = render(
      <>
        <GeneralSettingsContent {...props} />
        <GeneralSettingsLoading />
      </>,
    );

    const frames = [
      ["project-details", generalSettingsCardGeometryClassNames.projectDetails],
      ["tags-segments", generalSettingsCardGeometryClassNames.tagsSegments],
    ] as const;

    for (const [name, geometryClassName] of frames) {
      const settled = container.querySelector(
        `[data-general-settings-settled-frame="${name}"] [data-settings-card-frame="settled"]`,
      );
      const loading = container.querySelector(`[data-general-settings-loading-frame="${name}"]`);
      const geometryClasses = geometryClassName.split(" ");

      expect(settled).toBeInTheDocument();
      expect(loading).toBeInTheDocument();
      expect(settled).toHaveClass(...geometryClasses);
      expect(loading).toHaveClass(...geometryClasses);
    }
  });

  it("keeps the route loader as a complete settings shell around the inner loader", () => {
    const { container } = render(<GeneralSettingsRouteLoading />);

    expect(
      container.querySelector('[data-settings-loading-boundary="general"]'),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-general-settings-loading]")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-general-settings-loading-frame]")).toHaveLength(2);
  });
});
