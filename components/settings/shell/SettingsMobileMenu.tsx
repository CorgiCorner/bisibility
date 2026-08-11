"use client";

import {
  type SettingsSectionId,
  settingsSectionHref,
  settingsSections,
} from "@/components/settings/shell/settings-sections";
import { MenuSelect } from "@/components/ui";
import type { ProjectRef } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";

type SettingsMobileMenuProps = {
  activeSection: SettingsSectionId;
  projectRef: ProjectRef;
};

export function SettingsMobileMenu({
  activeSection,
  projectRef,
}: Readonly<SettingsMobileMenuProps>) {
  const router = useRouter();

  return (
    <div className="mb-5 lg:hidden">
      <MenuSelect
        ariaLabel="Settings section"
        onChange={(section) =>
          router.push(settingsSectionHref(projectRef, section as SettingsSectionId))
        }
        options={settingsSections.map((section) => ({ label: section.label, value: section.id }))}
        triggerClassName="w-full justify-between"
        value={activeSection}
      />
    </div>
  );
}
