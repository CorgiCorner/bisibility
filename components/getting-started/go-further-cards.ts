import { settingsSectionHref } from "@/components/settings/shell/settings-sections";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { GITHUB_URL } from "@/lib/site/site";

export type GoFurtherCard = Readonly<{
  description: string;
  external: boolean;
  href: string;
  id: "ai" | "github" | "team";
  title: string;
}>;

export function goFurtherCards(projectRef: ProjectRef): readonly GoFurtherCard[] {
  return [
    {
      description: "Roles and views your whole team sees",
      external: false,
      href: settingsSectionHref(projectRef, "team"),
      id: "team",
      title: "Invite teammates",
    },
    {
      description: "Works with Claude, ChatGPT, and more",
      external: false,
      href: appPath(projectRef, "install"),
      id: "ai",
      title: "Ask AI about your rankings",
    },
    {
      description: "Support the project",
      external: true,
      href: GITHUB_URL,
      id: "github",
      title: "Star on GitHub",
    },
  ];
}
