"use client";

import { validateSecurityReturnTo } from "@/lib/auth/security-return-to";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useContext } from "react";

const DangerousActionAccess = createContext(false);

export function DangerousActionAccessProvider({
  allowed,
  children,
}: Readonly<{ allowed: boolean; children: ReactNode }>) {
  return <DangerousActionAccess value={allowed}>{children}</DangerousActionAccess>;
}

type Action =
  | "addAccount"
  | "changeMail"
  | "changeCredentials"
  | "selectAccount"
  | "changeSettings"
  | "changeAccountStatus"
  | "changeAnnouncements"
  | "repairUsage"
  | "importUsage";

export function DangerousActionGate({
  action,
  actionLabel,
  children,
  returnTo,
}: Readonly<
  { children: ReactNode; returnTo?: string } & (
    | { action: Action; actionLabel?: never }
    | { actionLabel: string; action?: never }
  )
>) {
  const allowed = useContext(DangerousActionAccess);
  if (allowed) return children;
  return <DangerousActionNotice action={action} actionLabel={actionLabel} destination={returnTo} />;
}

function DangerousActionNotice({
  action,
  actionLabel,
  destination,
}: {
  action?: Action;
  actionLabel?: string;
  destination?: string;
}) {
  const t = useTranslations("instanceAdmin.dangerousActions");
  const pathname = usePathname();
  const query = useSearchParams();
  const current = `${pathname}${query?.size ? `?${query}` : ""}`;
  const returnTo =
    validateSecurityReturnTo(destination) ?? validateSecurityReturnTo(current) ?? "/app/admin";
  return (
    <div
      className="rounded-control border border-border bg-bg-sunken p-3 text-xs text-fg-muted"
      role="note"
    >
      <p className="m-0">
        {t("notice", { action: actionLabel ?? t(`actions.${action ?? "changeSettings"}`) })}
      </p>
      <Link
        className="mt-2 inline-block font-semibold text-accent-text hover:underline"
        href={`/app/account/security?returnTo=${encodeURIComponent(returnTo)}`}
      >
        {t("enable")}
      </Link>
    </div>
  );
}
