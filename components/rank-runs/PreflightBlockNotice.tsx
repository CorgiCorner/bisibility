import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { useTranslations } from "next-intl";
import type { PreflightBlockCode } from "./preflight-presentation";

type Props = {
  code: PreflightBlockCode | null;
  duplicateDetail?: string;
  budgetHref: string;
  duplicateRunHref: string;
  integrationsHref: string;
};

export function PreflightBlockNotice(props: Readonly<Props>) {
  const t = useTranslations("shared.rankPreflight");
  if (!props.code) return null;
  const block = {
    budget_exhausted: {
      cta: t("editBudget"),
      href: props.budgetHref,
      label: t("budget"),
      message: t("budgetBlocked"),
      tone: "attention" as const,
    },
    duplicate: {
      cta: t("openRun"),
      href: props.duplicateRunHref,
      label: t("runInProgress"),
      message: props.duplicateDetail ?? t("duplicate"),
      tone: "attention" as const,
    },
    no_provider: {
      cta: t("openIntegrations"),
      href: props.integrationsHref,
      label: t("noProvider"),
      message: t("noProviderBlocked"),
      tone: "critical" as const,
    },
  }[props.code];
  return (
    <div
      className="flex items-center gap-3 rounded-control border border-border bg-bg-sunken px-3.5 py-3"
      role="alert"
    >
      <div className="grid min-w-0 flex-1 justify-items-start gap-1.5">
        <StatusChip dot label={block.label} tone={block.tone} />
        <p className="m-0 text-[12.5px] leading-5 text-fg">{block.message}</p>
      </div>
      <Button className="shrink-0" href={block.href} size="sm" variant="secondary">
        {block.cta}
      </Button>
    </div>
  );
}
