import { AccountMobileMenu } from "@/components/account/AccountMobileMenu";
import { AccountSubnav } from "@/components/account/AccountSubnav";
import type { AccountSectionId } from "@/components/account/account-sections";
import {
  settingsContentColumnClassName,
  settingsShellGridClassName,
} from "@/components/settings/shell/settings-layout";
import type { ReactNode } from "react";

type AccountShellProps = {
  activeSection: AccountSectionId;
  children: ReactNode;
};

export function AccountShell({ activeSection, children }: Readonly<AccountShellProps>) {
  return (
    <div className="mx-auto w-full max-w-[1040px]" data-account-shell="">
      <div className={settingsShellGridClassName}>
        <AccountSubnav activeSection={activeSection} />
        <div className={settingsContentColumnClassName}>
          <AccountMobileMenu activeSection={activeSection} />
          {children}
        </div>
      </div>
    </div>
  );
}
