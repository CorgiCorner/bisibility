import { CloudImportSettingsLoading } from "@/components/cloud/CloudImportLoading";
import { MigrationTokenCard } from "@/components/cloud/MigrationTokenCard";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("CloudImportSettingsLoading", () => {
  it("mirrors the settled token card instead of the settings shell", () => {
    const { container } = render(
      <>
        <MigrationTokenCard
          activeToken={null}
          errorMessage={null}
          issuedToken={null}
          onGenerate={vi.fn()}
          onRegenerate={vi.fn()}
          onRevoke={vi.fn()}
          status="none"
          tokenSecurityNote="The token grants import access to this project only."
          workspaceName="SEO Project"
        />
        <CloudImportSettingsLoading />
      </>,
    );

    const settled = container.querySelector(".mt-7.overflow-hidden.rounded-card");
    const loading = container.querySelector('[data-cloud-import-loading-frame="token-card"]');

    expect(container.querySelector("[data-settings-loading-subnav]")).not.toBeInTheDocument();
    expect(container.querySelector('[data-cloud-import-loading="settings"]')).toBeInTheDocument();
    expect(container.querySelector('[data-cloud-import-loading-frame="back"]')).toBeInTheDocument();
    expect(settled).toBeInTheDocument();
    expect(loading).toBeInTheDocument();
    expect(loading).toHaveClass("mt-7", "overflow-hidden", "rounded-card", "border", "bg-bg-elev");
  });
});
