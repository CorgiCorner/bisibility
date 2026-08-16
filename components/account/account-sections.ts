import type { Icon } from "@phosphor-icons/react";
import {
  GearSixIcon as GearSix,
  ShieldCheckIcon as ShieldCheck,
  UserCircleIcon as UserCircle,
} from "@phosphor-icons/react/dist/ssr";

export const accountSections = [
  { href: "/app/account", icon: UserCircle, id: "profile", label: "Profile" },
  { href: "/app/account/preferences", icon: GearSix, id: "preferences", label: "Preferences" },
  { href: "/app/account/security", icon: ShieldCheck, id: "security", label: "Security" },
] as const satisfies ReadonlyArray<{ href: string; icon: Icon; id: string; label: string }>;

export type AccountSectionId = (typeof accountSections)[number]["id"];

export type AccountSection = (typeof accountSections)[number];

export function getAccountSection(id: string): AccountSection | undefined {
  return accountSections.find((section) => section.id === id);
}

export function accountSectionHref(id: AccountSectionId): string {
  const section = accountSections.find((item) => item.id === id);
  return section?.href ?? "/app/account";
}
