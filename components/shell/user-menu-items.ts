import { DISCORD_URL, DOCS_URL, FEEDBACK_URL, GITHUB_URL, MARKETING_URL } from "@/lib/site/site";
import { BookOpenTextIcon as BookOpenText } from "@phosphor-icons/react/dist/csr/BookOpenText";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { DiscordLogoIcon as DiscordLogo } from "@phosphor-icons/react/dist/csr/DiscordLogo";
import { GithubLogoIcon as GithubLogo } from "@phosphor-icons/react/dist/csr/GithubLogo";
import { HouseIcon as House } from "@phosphor-icons/react/dist/csr/House";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/dist/csr/SignOut";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/dist/csr/UserCircle";

export { ArrowUpRightIcon as trailingExternalIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";

import type { Icon } from "@phosphor-icons/react/lib";

export type UserMenuLink = {
  label: string;
  icon: Icon;
  hostedOnly?: boolean;
  href?: string;
  external?: boolean;
};

// Account / personal section (HANDOFF-2 §6). Project config stays in Settings.
export const accountLinks = [
  { label: "Account settings", href: "/app/account", icon: UserCircle },
] satisfies UserMenuLink[];

export const resourceLinks = [
  { label: "Docs and self-hosting", href: DOCS_URL, icon: BookOpenText, external: true },
  // Hosted builds link back to the vendor site without relying on the regional app host.
  {
    label: "Homepage",
    href: MARKETING_URL,
    icon: House,
    external: true,
    hostedOnly: true,
  },
  { label: "Send feedback", href: FEEDBACK_URL, icon: ChatCircleDots, external: true },
] satisfies UserMenuLink[];

export function resourceLinksForDeployment(showHostedLinks: boolean) {
  return resourceLinks.filter((item) => showHostedLinks || !item.hostedOnly);
}

export const communityLinks = [
  { label: "GitHub", href: GITHUB_URL, icon: GithubLogo, external: true },
  { label: "Discord", href: DISCORD_URL, icon: DiscordLogo, external: true },
] satisfies UserMenuLink[];

export const signOutLink = { label: "Sign out", icon: SignOut } satisfies UserMenuLink;
