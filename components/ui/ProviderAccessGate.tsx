"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";
export function ProviderAccessGate({
  blocked,
  children,
  href,
  providers = [],
  reason,
  reconnect = false,
}: Readonly<{
  blocked: boolean;
  children: ReactNode;
  href?: string;
  providers?: readonly string[];
  reason?: string;
  reconnect?: boolean;
}>) {
  const t = useTranslations("shared.providerAccess");
  const id = useId();
  if (!blocked) return children;
  const explanation = reason || t(reconnect ? "reconnect" : "connect");
  const supported = reason
    ? ""
    : providers.length
      ? t("supported", { providers: providers.join(", ") })
      : t("unavailable");
  return (
    <div className="grid min-w-0 gap-2" data-provider-locked>
      <Card size="sm" className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <LockSimpleIcon aria-hidden size={16} className="mt-0.5 shrink-0 text-fg-muted" />
          <div id={id} className="flex min-w-0 flex-col gap-1">
            <p className="m-0 text-xs font-medium leading-5 text-fg">{explanation}</p>
            {supported ? <p className="m-0 text-xs leading-5 text-fg-muted">{supported}</p> : null}
          </div>
        </div>
        {!reason && href ? (
          <Button
            asChild
            size="xs"
            variant="outline"
            className="self-start sm:shrink-0 sm:self-center"
          >
            <Link href={href}>{t(reconnect ? "reconnectAction" : "action")}</Link>
          </Button>
        ) : null}
      </Card>
      <fieldset
        aria-describedby={id}
        disabled
        className="m-0 min-w-0 border-0 p-0 [&_input]:cursor-not-allowed [&_input]:text-fg-muted [&_input]:placeholder:text-fg-muted [&_input:not([data-input-inner])]:border-solid [&_input:not([data-input-inner])]:bg-bg-sunken [&_textarea:disabled]:cursor-not-allowed [&_textarea:disabled]:border-solid [&_textarea:disabled]:bg-bg-sunken [&_textarea:disabled]:text-fg-muted [&_[data-input-shell]]:bg-bg-sunken [&_button]:cursor-not-allowed [&_button[aria-haspopup]]:border-solid [&_button[aria-haspopup]]:bg-bg-sunken [&_button[aria-haspopup]]:text-fg-muted [&_button[aria-haspopup]]:opacity-100 [&_button[aria-haspopup]_*]:text-fg-muted"
      >
        {children}
      </fieldset>
    </div>
  );
}
