"use client";

import {
  type AccountSectionId,
  accountSectionHref,
  accountSections,
} from "@/components/account/account-sections";
import { MenuSelect } from "@/components/ui";
import { useRouter } from "next/navigation";

type AccountMobileMenuProps = {
  activeSection: AccountSectionId;
};

export function AccountMobileMenu({ activeSection }: Readonly<AccountMobileMenuProps>) {
  const router = useRouter();

  return (
    <div className="mb-5 lg:hidden">
      <MenuSelect
        ariaLabel="Account section"
        onChange={(section) => router.push(accountSectionHref(section as AccountSectionId))}
        options={accountSections.map((section) => ({ label: section.label, value: section.id }))}
        triggerClassName="w-full justify-between"
        value={activeSection}
      />
    </div>
  );
}
