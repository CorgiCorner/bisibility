"use client";

import { SettingsSearch } from "@/components/settings/shell/SettingsSearch";
import {
  type SettingsSectionId,
  settingsSectionGroups,
  settingsSectionHref,
  settingsSectionLabel,
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
          groups={settingsSectionGroups.map((group) => ({
            id: group.id,
            label: t(`groups.${group.id}`),
            options: group.sections.map((id) => ({
              label: settingsSectionLabel(t, id),
              value: id,
            })),
          }))}
          triggerClassName="w-full justify-between"
          value={activeSection}
        />
      </SettingsSearch>
    </div>
  );
}
