import { type AccountSectionId, accountSections } from "@/components/account/account-sections";
import {
  settingsContentColumnClassName,
  settingsShellGridClassName,
} from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

type AccountLoadingBarProps = { className?: string };

export function AccountLoadingBar({ className }: Readonly<AccountLoadingBarProps>) {
  return (
    <div
      className={cn("animate-pulse rounded-[6px] bg-bg-sunken", className)}
      data-account-loading-bar=""
    />
  );
}

function AccountLoadingMobileMenu() {
  return (
    <div className="mb-5 lg:hidden" data-account-loading-mobile-menu="">
      <AccountLoadingBar className="h-8.5 w-full" />
    </div>
  );
}

function AccountLoadingSubnav({ activeSection }: Readonly<{ activeSection: AccountSectionId }>) {
  return (
    <nav
      aria-hidden
      className="sticky top-6 hidden w-[200px] self-start flex-col gap-0.5 pl-3.5 lg:flex"
      data-account-loading-active-section={activeSection}
      data-account-loading-subnav=""
    >
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {accountSections.map((section) => {
          const current = section.id === activeSection;
          return (
            <li key={section.id}>
              <div
                className="relative flex h-10 items-center gap-2.5 rounded-[9px] px-[11px]"
                data-account-loading-subnav-active={current ? "true" : "false"}
                data-account-loading-subnav-row={section.id}
              >
                {current ? (
                  <span
                    className="absolute -left-2.5 h-1.5 w-1.5 rounded-full bg-accent-solid"
                    data-account-loading-subnav-active-dot=""
                  />
                ) : null}
                <span
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center"
                  data-account-loading-subnav-icon-slot={section.id}
                >
                  <AccountLoadingBar className="h-4 w-4" />
                </span>
                <AccountLoadingBar className="h-3 w-20" />
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type AccountShellLoadingProps = {
  activeSection: AccountSectionId;
  children: ReactNode;
};

export function AccountShellLoading({
  activeSection,
  children,
}: Readonly<AccountShellLoadingProps>) {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-[1040px]"
      data-account-loading-boundary={activeSection}
      data-account-shell-loading=""
    >
      <AccountLoadingMobileMenu />
      <div className={settingsShellGridClassName} data-account-loading-grid="">
        <AccountLoadingSubnav activeSection={activeSection} />
        <div className={settingsContentColumnClassName}>{children}</div>
      </div>
    </div>
  );
}
