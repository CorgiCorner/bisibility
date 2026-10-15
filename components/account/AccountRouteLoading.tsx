"use client";
import { AccountSection } from "@/components/account/AccountSection";
import {
  AccountShellLoading,
  AccountLoadingBar as Bar,
} from "@/components/account/AccountShellLoading";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Section =
  | "profile"
  | "email"
  | "connected"
  | "privacy"
  | "preferences"
  | "security.twoFactor"
  | "security.personalTokens";
function Frame({
  name,
  action = false,
  contentClassName,
  children,
}: Readonly<{ name: Section; action?: boolean; contentClassName?: string; children: ReactNode }>) {
  const t = useTranslations("account");
  return (
    <AccountSection
      title={t(`${name}.title`)}
      description={
        name === "preferences"
          ? t.rich("preferences.description", { emphasis: (chunks) => <strong>{chunks}</strong> })
          : t(`${name}.description`)
      }
      action={action ? <Bar className="h-8 w-20" /> : undefined}
      contentClassName={contentClassName}
    >
      {children}
    </AccountSection>
  );
}
function Field({ help = false }: Readonly<{ help?: boolean }>) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Bar className="h-[15px] w-28" />
      {help ? <Bar className="h-8 w-full" /> : null}
      <Bar className="h-10 w-full" />
    </div>
  );
}
function Rows({ count = 2 }: Readonly<{ count?: number }>) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }, (_, key) => (
        <div key={key} className="flex items-center gap-[13px] px-4.5 py-3.5">
          <Bar className="h-8.5 w-[34px] shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <Bar className="h-5 w-28" />
            <Bar className="h-[17px] w-44" />
          </div>
          <Bar className="h-8 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}
function Profile() {
  const t = useTranslations("account.delete");
  return (
    <>
      <Frame name="profile" action>
        <div className="flex items-center gap-3.5">
          <Bar className="h-[54px] w-[54px] shrink-0 rounded-card" />
          <div className="min-w-0 space-y-1">
            <Bar className="h-[22.5px] w-36" />
            <Bar className="h-5 w-44" />
          </div>
        </div>
        <div className="mt-4.5 grid gap-3.5 sm:grid-cols-2">
          <Field />
          <Field />
          <div className="sm:col-span-2 sm:max-w-[50%]">
            <Field />
          </div>
        </div>
      </Frame>
      <Frame name="email">
        <Field />
        <div className="mt-3 flex justify-end">
          <Bar className="h-8 w-32" />
        </div>
      </Frame>
      <Frame name="connected" contentClassName="overflow-hidden p-0">
        <Rows />
      </Frame>
      <Frame name="privacy">
        <Bar className="h-5 w-40" />
      </Frame>
      <div className="rounded-card border border-red bg-bg-elev px-5 py-4.5">
        <div className="text-[14.5px] font-semibold text-red-text">{t("title")}</div>
        <p className="m-0 mt-[3px] max-w-[560px] text-[12.5px] leading-normal text-fg-muted">
          {t("description")}
        </p>
        <div className="mt-3 flex justify-end">
          <Bar className="h-9 w-36" />
        </div>
      </div>
    </>
  );
}
function Preferences() {
  return (
    <Frame name="preferences" contentClassName="px-5 py-4.5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3.5">
          <div className="space-y-1">
            <Bar className="h-5 w-16" />
            <Bar className="h-[18px] w-48" />
          </div>
          <Bar className="h-8 w-40" />
        </div>
        <div className="grid gap-3.5 border-t border-border pt-4 sm:grid-cols-2">
          <Field />
          <Field />
        </div>
        <div className="grid gap-3.5 border-t border-border pt-4 sm:grid-cols-2">
          <Field help />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-border pt-4">
          <div className="space-y-1">
            <Bar className="h-5 w-40" />
            <Bar className="h-[18px] w-52" />
          </div>
          <Bar className="h-8 w-44" />
        </div>
      </div>
    </Frame>
  );
}
function Security() {
  const t = useTranslations("account.security.sessions");
  return (
    <>
      <Frame name="security.twoFactor" contentClassName="px-4.5 py-4">
        <div className="flex items-center gap-[13px]">
          <Bar className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <Bar className="h-5 w-40" />
            <Bar className="h-[17px] w-36" />
          </div>
          <Bar className="h-8 w-20 shrink-0" />
        </div>
      </Frame>
      <Frame name="security.personalTokens" action>
        <div className="space-y-3 rounded-control border border-border p-3">
          <Bar className="h-5 w-44" />
          <Bar className="h-[17px] w-full" />
          <Bar className="h-5 w-28" />
        </div>
      </Frame>
      <section>
        <div className="text-[15px] font-semibold text-fg">{t("title")}</div>
        <p className="m-0 mt-[3px] text-[12.5px] leading-normal text-fg-muted">
          {t("description")}
        </p>
        <div className="mt-3.5 overflow-hidden rounded-card border border-border bg-bg-elev">
          <Rows count={3} />
        </div>
      </section>
    </>
  );
}
export function AccountRouteLoading({
  active = "profile",
}: Readonly<{ active?: "profile" | "preferences" | "security" }>) {
  return (
    <AccountShellLoading activeSection={active}>
      <div className="flex flex-col gap-5.5" data-account-content-loading={active}>
        {active === "profile" ? (
          <Profile />
        ) : active === "preferences" ? (
          <Preferences />
        ) : (
          <Security />
        )}
      </div>
    </AccountShellLoading>
  );
}
