"use client";

import { SettingsSearch } from "@/components/settings/shell/SettingsSearch";
import {
  type SettingsSectionId,
  settingsSectionHref,
  settingsSectionLabel,
  settingsSections,
} from "@/components/settings/shell/settings-sections";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { ProjectRef } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type SettingsMobileMenuProps = {
  activeSection: SettingsSectionId;
  projectRef: ProjectRef;
};

export function SettingsMobileMenu({
  activeSection,
  projectRef,
}: Readonly<SettingsMobileMenuProps>) {
  const router = useRouter();
  const t = useTranslations("projectSettingsShell");

  return (
    <div className="mb-5 lg:hidden">
      <SettingsSearch projectRef={projectRef}>
        <MenuSelect
          ariaLabel={t("mobileSectionLabel")}
          onChange={(section) =>
            router.push(settingsSectionHref(projectRef, section as SettingsSectionId))
          }
          options={settingsSections.map((section) => ({
            label: settingsSectionLabel(t, section.id),
            value: section.id,
          }))}
          triggerClassName="w-full justify-between"
          value={activeSection}
        />
      </SettingsSearch>
    </div>
  );
}
