"use client";

// `setup` is provided by the setup layout's FeatureMessagesProvider, a client boundary, so this
// card must render on that side of it rather than against the `shared`-only request config.

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type AccountStatusCardProps = {
  administratorExists: boolean;
  recoveryAction?: ReactNode;
  switchAccountAction: () => Promise<void>;
};

function AccountSwitchForm({
  action,
}: Readonly<{ action: AccountStatusCardProps["switchAccountAction"] }>) {
  const t = useTranslations("setup.status");
  return (
    <form action={action} className="flex-1">
      <Button
        aria-label={t("switchAccountAria")}
        className="w-full"
        size="lg"
        type="submit"
        variant="secondary"
      >
        {t("switchAccount")}
      </Button>
    </form>
  );
}

export function SetupAccountStatusCard(props: Readonly<AccountStatusCardProps>) {
  const { administratorExists, switchAccountAction } = props;
  const t = useTranslations("setup.status");

  return (
    <Card className="flex flex-col gap-4.5 p-7" size="lg">
      <div className="flex items-start gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-accent-soft text-accent-solid">
          <ShieldCheck aria-hidden size={22} weight="regular" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[20px] font-bold tracking-[-0.02em]">
            {administratorExists ? t("complete") : t("finish")}
          </h1>
          <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">
            {administratorExists ? t("administratorExists") : t("pending")}
          </p>
        </div>
      </div>
      <div className="flex gap-2.5">
        {administratorExists ? (
          <Button className="flex-1" component={Link} href="/app" size="lg">
            {t("goToApp")}
          </Button>
        ) : (
          (props.recoveryAction ?? null)
        )}
        <AccountSwitchForm action={switchAccountAction} />
      </div>
    </Card>
  );
}
