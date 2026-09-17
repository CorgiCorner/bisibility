import { FieldLabel } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  importMarketLabel,
  type KeywordImportMarketContext,
} from "@/lib/keywords/import-market-context";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function ImportMarketSelection({
  context,
  disabled,
  onChange,
  projectId,
  value,
}: Readonly<{
  context: KeywordImportMarketContext;
  disabled: boolean;
  onChange: (key: string | null) => void;
  projectId?: string;
  value: string | null;
}>) {
  const t = useTranslations("projectRankTracker.keywordImport.csvWizard.marketSelection");
  const selected = context.markets.find((market) => market.canonicalKey === value);
  return (
    <section
      aria-label={t("aria")}
      className="mb-5 grid gap-2 rounded-control border border-border bg-bg-sunken p-3"
    >
      {context.markets.length ? (
        <>
          <FieldLabel label={t("label")} />
          <MenuSelect
            ariaLabel={t("label")}
            disabled={disabled}
            onChange={(key) => onChange(key === "from-file" ? null : key)}
            options={[
              { label: t("fromFile"), value: "from-file" },
              ...context.markets.map((market) => ({
                label: importMarketLabel(market),
                value: market.canonicalKey,
              })),
            ]}
            size="input"
            value={value ?? "from-file"}
          />
          <p className="m-0 text-[12px] leading-[1.5] text-fg-muted">
            {selected ? t("selectedDescription") : t("fileDescription")}
          </p>
          {selected?.status === "paused" ? (
            <p className="m-0 text-[12px] text-fg-muted" role="status">
              {t("paused")}
            </p>
          ) : null}
        </>
      ) : (
        <p className="m-0 text-[13px] text-fg-muted" role="status">
          {t("noMarkets")}
        </p>
      )}
      {projectId ? (
        <Link
          className="text-[12px] font-medium text-accent-text"
          href={appPath(projectId, "markets")}
        >
          {t("manage")}
        </Link>
      ) : null}
    </section>
  );
}
