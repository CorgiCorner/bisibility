"use client";

import { useTranslations } from "next-intl";
import { AccountShell } from "./AccountShell";
import type { AccountSectionId } from "./account-sections";

export function DemoAccountNotice({ section }: { section: AccountSectionId }) {
  const t = useTranslations("account.demo");

  return (
    <AccountShell activeSection={section}>
      <section className="rounded-card border border-border bg-bg-elev p-5">
        <h1 className="m-0 text-lg font-semibold">{t("title")}</h1>
        <p className="mb-0 text-sm text-fg-muted">{t("description")}</p>
      </section>
    </AccountShell>
  );
}
