"use client";

// `setup.success` exists only in the setup layout's client message boundary.

import { Button } from "@/components/ui/Button";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { appRootPath } from "@/lib/routing/app-path";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { useTranslations } from "next-intl";
import { SetupSuccessConfetti } from "./SetupSuccessConfetti";

export type SetupEmailNotice = "hidden" | "server";

export function SetupSuccess({
  emailNotice,
  mailerConfigured,
}: Readonly<{ emailNotice?: SetupEmailNotice; mailerConfigured: boolean }>) {
  const t = useTranslations("setup.success");
  const notice = emailNotice ?? (mailerConfigured ? "hidden" : "server");
  return (
    <>
      <SetupSuccessConfetti />
      <div className="flex flex-col items-center gap-3.5 px-0 pt-2 pb-0.5 text-center">
        <span className="grid h-[58px] w-[58px] place-items-center rounded-full bg-[#e8f0e4] text-[#2f7f50]">
          <CheckCircle aria-hidden size={32} weight="regular" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[23px] font-bold tracking-[-0.02em]">{t("title")}</h1>
          <p className="m-0 text-[14px] leading-[1.55] text-fg-muted">{t("description")}</p>
        </div>
      </div>
      <Button
        className="w-full"
        endIcon={<CaretRight size={15} weight="regular" />}
        href={appRootPath()}
        size="lg"
      >
        {t("continue")}
      </Button>
      <ExternalLink
        className="justify-center text-[12.5px] font-medium text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
        href={appRootPath("admin")}
      >
        {t("adminPanel")}
      </ExternalLink>
      {notice === "server" ? (
        <div className="flex items-start gap-2.5 rounded-control border border-border bg-bg p-[11px_13px] text-left">
          <EnvelopeSimple
            aria-hidden
            className="mt-px shrink-0 text-[#a06b2a]"
            size={16}
            weight="regular"
          />
          <p className="m-0 text-[12.5px] leading-[1.5] text-fg-muted">
            <strong className="block font-semibold text-fg">{t("emailTitle")}</strong>
            {t("emailDescription")}
          </p>
        </div>
      ) : null}
    </>
  );
}
