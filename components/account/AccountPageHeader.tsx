import { cn } from "@/lib/ui/cn";
import Link from "next/link";

const tabs = [
  { href: "/app/account", label: "Profile" },
  { href: "/app/account/preferences", label: "Preferences" },
  { href: "/app/account/security", label: "Security" },
] as const;

export type AccountPageHeaderProps = {
  active: (typeof tabs)[number]["href"];
};

export function AccountPageHeader({ active }: Readonly<AccountPageHeaderProps>) {
  return (
    <header>
      <nav
        className="flex w-max max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] border border-border-strong bg-bg-sunken p-[3px]"
        aria-label="Account settings"
      >
        {tabs.map((tab) => {
          const isActive = tab.href === active;
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-lg px-4 py-[7px] text-[13px] font-semibold leading-normal text-fg-muted transition-colors hover:text-fg",
                isActive && "bg-accent text-white hover:text-white",
              )}
              href={tab.href}
              key={tab.href}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
