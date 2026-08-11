import { GeneralSettingsSection } from "@/components/settings/general/GeneralSettingsSection";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmProjectDomainChange: vi.fn(),
  contentProps: undefined as unknown,
  createTagResult: vi.fn(),
  deleteTagResult: vi.fn(),
  updateProjectDetails: vi.fn(),
}));

vi.mock("@/components/settings/general/GeneralSettingsContent", () => ({
  GeneralSettingsContent: (props: unknown) => {
    mocks.contentProps = props;
    return <div data-general-settings-content-test="" />;
  },
}));
vi.mock("@/lib/actions/project-domain-change", () => ({
  confirmProjectDomainChange: mocks.confirmProjectDomainChange,
}));
vi.mock("@/lib/actions/settings", () => ({ updateProjectDetails: mocks.updateProjectDetails }));
vi.mock("@/lib/actions/tags", () => ({
  createTagResult: mocks.createTagResult,
  deleteTagResult: mocks.deleteTagResult,
}));

describe("GeneralSettingsSection", () => {
  it("uses B3's confirmed domain action instead of the name-update action", () => {
    render(
      <GeneralSettingsSection
        canCreateTags
        canDeleteTags
        canEditProject
        project={{ domain: "example.com", name: "Example", projectId: "prj_7Kd2Qf9m" }}
        tags={[]}
      />,
    );

    expect(mocks.contentProps).toEqual(
      expect.objectContaining({
        requestDomainChange: mocks.confirmProjectDomainChange,
        updateProject: mocks.updateProjectDetails,
      }),
    );
  });
});
