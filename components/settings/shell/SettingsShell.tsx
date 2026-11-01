import { LegacySettingsHashRedirect } from "@/components/settings/shell/LegacySettingsHashRedirect";
import { SettingsMobileMenu } from "@/components/settings/shell/SettingsMobileMenu";
import { SettingsSubnav } from "@/components/settings/shell/SettingsSubnav";
import {
  settingsContentColumnClassName,
  settingsShellGridClassName,
} from "@/components/settings/shell/settings-layout";
import type { SettingsSectionId } from "@/components/settings/shell/settings-sections";
import { deploymentMode } from "@/lib/deployment/deployment";
import type { ProjectRef } from "@/lib/routing/app-path";
import type { ReactNode } from "react";

type SettingsShellProps = {
  activeSection: SettingsSectionId;
  children: ReactNode;
  projectRef: ProjectRef;
};

export function SettingsShell({
  activeSection,
  children,
  projectRef,
}: Readonly<SettingsShellProps>) {
  return (
    <SettingsShellFrame
      activeSection={activeSection}
      projectRef={projectRef}
      showUsage={deploymentMode() === "cloud"}
    >
      {children}
    </SettingsShellFrame>
  );
}

/** The route supplies deployment gating; stories can render the same frame in either mode. */
export function SettingsShellFrame({
  activeSection,
  children,
  projectRef,
  showUsage,
}: Readonly<SettingsShellProps & { showUsage: boolean }>) {
  return (
    <div className="mx-auto w-full max-w-[1040px]" data-settings-shell="">
      <div className={settingsShellGridClassName}>
        <SettingsSubnav
          activeSection={activeSection}
          projectRef={projectRef}
          showUsage={showUsage}
        />
        <div className={settingsContentColumnClassName}>
          <SettingsMobileMenu
            activeSection={activeSection}
            projectRef={projectRef}
            showUsage={showUsage}
          />
          <LegacySettingsHashRedirect projectRef={projectRef} />
          {children}
        </div>
      </div>
    </div>
  );
}
