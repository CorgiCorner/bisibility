import { settingsSectionHref } from "@/components/settings/shell/settings-sections";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { GITHUB_URL } from "@/lib/site/site";

export type GoFurtherCard = Readonly<{
  external: boolean;
  href: string;
  id: "ai" | "github" | "team";
}>;

export function goFurtherCards(projectRef: ProjectRef): readonly GoFurtherCard[] {
  return [
    {
      external: false,
      href: settingsSectionHref(projectRef, "team"),
      id: "team",
    },
    {
      external: false,
      href: appPath(projectRef, "install"),
      id: "ai",
    },
    {
      external: true,
      href: GITHUB_URL,
      id: "github",
    },
  ];
}
