import { LegacySettingsHashRedirect } from "@/components/settings/shell/LegacySettingsHashRedirect";
import { SettingsMobileMenu } from "@/components/settings/shell/SettingsMobileMenu";
import { SettingsSubnav } from "@/components/settings/shell/SettingsSubnav";
import {
  settingsContentColumnClassName,
  settingsShellGridClassName,
} from "@/components/settings/shell/settings-layout";
import type { SettingsSectionId } from "@/components/settings/shell/settings-sections";
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
    <div className="mx-auto w-full max-w-[1040px]" data-settings-shell="">
      <SettingsMobileMenu activeSection={activeSection} projectRef={projectRef} />
      <div className={settingsShellGridClassName}>
        <SettingsSubnav activeSection={activeSection} projectRef={projectRef} />
        <div className={settingsContentColumnClassName}>
          <LegacySettingsHashRedirect projectRef={projectRef} />
          {children}
        </div>
      </div>
    </div>
  );
}
