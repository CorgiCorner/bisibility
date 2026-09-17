"use client";

import {
  type AccountSectionId,
  accountSectionHref,
  accountSections,
} from "@/components/account/account-sections";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type AccountMobileMenuProps = {
  activeSection: AccountSectionId;
};

export function AccountMobileMenu({ activeSection }: Readonly<AccountMobileMenuProps>) {
  const router = useRouter();
  const t = useTranslations("account.navigation");

  return (
    <div className="mb-5 lg:hidden">
      <MenuSelect
        ariaLabel={t("ariaLabel")}
        onChange={(section) => router.push(accountSectionHref(section as AccountSectionId))}
        options={accountSections.map((section) => ({ label: t(section.id), value: section.id }))}
        triggerClassName="w-full justify-between"
        value={activeSection}
      />
    </div>
  );
}
