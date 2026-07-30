import { DOCS_URL, FEEDBACK_URL, GITHUB_URL, MARKETING_URL } from "@/lib/site/site";
import {
  BookOpenTextIcon as BookOpenText,
  ChatCircleDotsIcon as ChatCircleDots,
  CommandIcon as Command,
  GithubLogoIcon as GithubLogo,
  HouseIcon as House,
  SignOutIcon as SignOut,
  SlidersHorizontalIcon as SlidersHorizontal,
  UserCircleIcon as UserCircle,
} from "@phosphor-icons/react";

export { ArrowUpRightIcon as trailingExternalIcon } from "@phosphor-icons/react";

import type { Icon } from "@phosphor-icons/react/lib";

export type UserMenuLink = {
  label: string;
  icon: Icon;
  action?: "command-palette";
  hostedOnly?: boolean;
  href?: string;
  external?: boolean;
  /** Trailing hint (e.g. the `?` on Keyboard shortcuts). */
  hint?: string;
};

// Account / personal section (HANDOFF-2 §6). Project config stays in Settings.
export const accountLinks = [
  { label: "Account settings", href: "/app/account", icon: UserCircle },
  { label: "Preferences", href: "/app/account/preferences", icon: SlidersHorizontal },
  { label: "Keyboard shortcuts", action: "command-palette", icon: Command, hint: "⌘K" },
] satisfies UserMenuLink[];

export const resourceLinks = [
  { label: "Docs & self-hosting", href: DOCS_URL, icon: BookOpenText, external: true },
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
] satisfies UserMenuLink[];

export const signOutLink = { label: "Sign out", icon: SignOut } satisfies UserMenuLink;
