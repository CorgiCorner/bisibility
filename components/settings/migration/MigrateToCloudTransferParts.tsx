import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { TerminalWindowIcon as TerminalWindow } from "@phosphor-icons/react/dist/csr/TerminalWindow";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function StepLabel({ index, title }: Readonly<{ index: number; title: string }>) {
  const t = useTranslations("projectSettingsMigration.transfer");
  const locale = useLocale();
  return (
    <div className="mt-5 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
      {t("step", { index: new Intl.NumberFormat(locale).format(index), title })}
    </div>
  );
}

export function TokenSourceStep({
  children,
  step,
  targetLabel,
}: Readonly<{
  children: ReactNode;
  step: number;
  targetLabel: string;
}>) {
  const t = useTranslations("projectSettingsMigration.transfer");
  return (
    <>
      <StepLabel index={step} title={t("createToken", { target: targetLabel })} />
      <p className="m-0 mt-2 text-[12.5px] leading-5 text-fg-muted">{t("tokenSource")}</p>
      {children}
    </>
  );
}

export function StepHeading({ body, title }: Readonly<{ body: string; title: string }>) {
  return (
    <>
      <h3 className="m-0 text-[15px] font-semibold">{title}</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">{body}</p>
    </>
  );
}

export function InfoBox({
  children,
  icon = "info",
}: Readonly<{ children: ReactNode; icon?: "info" | "terminal" }>) {
  const Icon = icon === "terminal" ? TerminalWindow : Info;
  return (
    <div className="mt-4 flex items-start gap-[9px] rounded-control border border-dashed border-border bg-transparent px-3.5 py-3 text-xs leading-5 text-fg-muted">
      <span className="flex h-5 shrink-0 items-center">
        <Icon aria-hidden className="text-accent-text" size={15} weight="regular" />
      </span>
      <span>{children}</span>
    </div>
  );
}
