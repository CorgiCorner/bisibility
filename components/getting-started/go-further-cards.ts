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
      description: "Invite teammates and assign roles.",
      external: false,
      href: settingsSectionHref(projectRef, "team"),
      id: "team",
      title: "Invite teammates",
    },
    {
      description: "Connect Claude, ChatGPT or any MCP client.",
      external: false,
      href: appPath(projectRef, "install"),
      id: "ai",
      title: "Connect an AI assistant",
    },
    {
      description: "Free and open source - a star helps.",
      external: true,
      href: GITHUB_URL,
      id: "github",
      title: "Star bisibility on GitHub",
    },
  ];
}
